"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Clock, Plus, Search, X, AlertTriangle, CheckCircle2,
  RefreshCcw, User, Ban, ArrowRight, Loader2,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────
interface GracePeriod {
  id: string;
  subscriberCode: string;
  subscriberName: string;
  subscriberId: string;
  graceDays: number;
  type: "PAYMENT" | "SUSPENSION" | "COMPLAINT" | "CUSTOM";
  suspensionDate: string | null;
  expiryDate: string;
  reason: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "COMPLETED";
  createdAt: string;
  createdBy: string;
}

interface GracePeriodFormData {
  subscriberId: string;
  subscriberCode: string;
  subscriberName: string;
  graceDays: number;
  type: "PAYMENT" | "SUSPENSION" | "COMPLAINT" | "CUSTOM";
  reason: string;
}

interface UpdateStatusData {
  id: string;
  status: "COMPLETED" | "CANCELLED" | "EXPIRED";
}

const FALLBACK_DATA: GracePeriod[] = [
  { id: "gp-001", subscriberCode: "CRY-00104", subscriberName: "Arun Mehta", subscriberId: "sub-104", graceDays: 7, type: "PAYMENT", suspensionDate: "2025-01-10", expiryDate: "2025-01-17", reason: "Awaiting payment confirmation from bank", status: "ACTIVE", createdAt: "2025-01-10T09:00:00Z", createdBy: "admin" },
  { id: "gp-002", subscriberCode: "CRY-00218", subscriberName: "Priya Sharma", subscriberId: "sub-218", graceDays: 14, type: "COMPLAINT", suspensionDate: "2025-01-05", expiryDate: "2025-01-19", reason: "Open complaint #CR-4521 — speed issues pending resolution", status: "ACTIVE", createdAt: "2025-01-05T14:30:00Z", createdBy: "support-lead" },
  { id: "gp-003", subscriberCode: "CRY-00156", subscriberName: "Rahul Verma", subscriberId: "sub-156", graceDays: 3, type: "SUSPENSION", suspensionDate: "2025-01-08", expiryDate: "2025-01-11", reason: "Document verification pending — Aadhaar resubmission", status: "COMPLETED", createdAt: "2025-01-08T11:00:00Z", createdBy: "admin" },
  { id: "gp-004", subscriberCode: "CRY-00301", subscriberName: "Sunita Devi", subscriberId: "sub-301", graceDays: 5, type: "PAYMENT", suspensionDate: "2025-01-02", expiryDate: "2025-01-07", reason: "Holiday period — standard festive grace window", status: "EXPIRED", createdAt: "2025-01-02T08:00:00Z", createdBy: "billing-ops" },
  { id: "gp-005", subscriberCode: "CRY-00089", subscriberName: "Kiran Joshi", subscriberId: "sub-89", graceDays: 10, type: "CUSTOM", suspensionDate: "2025-01-12", expiryDate: "2025-01-22", reason: "Customer requested extension due to medical emergency", status: "ACTIVE", createdAt: "2025-01-12T16:00:00Z", createdBy: "support-lead" },
  { id: "gp-006", subscriberCode: "CRY-00175", subscriberName: "Deepak Singh", subscriberId: "sub-175", graceDays: 7, type: "PAYMENT", suspensionDate: "2025-01-06", expiryDate: "2025-01-13", reason: "Payment deferred — salary delayed", status: "CANCELLED", createdAt: "2025-01-06T10:00:00Z", createdBy: "admin" },
  { id: "gp-007", subscriberCode: "CRY-00412", subscriberName: "Meena Patel", subscriberId: "sub-412", graceDays: 5, type: "COMPLAINT", suspensionDate: "2025-01-14", expiryDate: "2025-01-19", reason: "Fiber cable cut on customer street — repair in progress", status: "ACTIVE", createdAt: "2025-01-14T07:00:00Z", createdBy: "noc-team" },
];

const PAGE_SIZE = 8;

// ─── Helpers ────────────────────────────────────────────────────
function getTypeBadge(type: string) {
  switch (type) {
    case "PAYMENT": return <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400">Payment</Badge>;
    case "SUSPENSION": return <Badge variant="outline" className="text-[10px] border-red-400 text-red-700 dark:border-red-600 dark:text-red-400">Suspension</Badge>;
    case "COMPLAINT": return <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-700 dark:border-purple-600 dark:text-purple-400">Complaint</Badge>;
    case "CUSTOM": return <Badge variant="outline" className="text-[10px] border-teal-400 text-teal-700 dark:border-teal-600 dark:text-teal-400">Custom</Badge>;
    default: return <Badge variant="secondary" className="text-[10px]">{type}</Badge>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "ACTIVE": return <Badge className="text-[10px] bg-green-600 hover:bg-green-700 text-white">Active</Badge>;
    case "EXPIRED": return <Badge className="text-[10px] bg-slate-500 hover:bg-slate-600 text-white">Expired</Badge>;
    case "CANCELLED": return <Badge variant="outline" className="text-[10px] border-gray-400 text-gray-600">Cancelled</Badge>;
    case "COMPLETED": return <Badge className="text-[10px] bg-teal-600 hover:bg-teal-700 text-white">Completed</Badge>;
    default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  }
}

function getDaysRemaining(expiryDate: string, status: string): number | null {
  if (status !== "ACTIVE") return null;
  const diff = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// ─── Component ────────────────────────────────────────────────────
export default function GracePeriodsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gracePeriods, setGracePeriods] = useState<GracePeriod[]>([]);

  // Dialog state
  const [applyOpen, setApplyOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");

  // Form
  const [form, setForm] = useState<GracePeriodFormData>({
    subscriberId: "", subscriberCode: "", subscriberName: "",
    graceDays: 7, type: "PAYMENT", reason: "",
  });

  // Update status form
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusData>({ id: "", status: "COMPLETED" });

  // Subscriber lookup
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscriberResults, setSubscriberResults] = useState<{ id: string; code: string; name: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const demoSubscribers = [
    { id: "sub-100", code: "CRY-00100", name: "Vikram Rao" },
    { id: "sub-101", code: "CRY-00101", name: "Anita Desai" },
    { id: "sub-102", code: "CRY-00102", name: "Raj Malhotra" },
    { id: "sub-103", code: "CRY-00103", name: "Lakshmi Iyer" },
    { id: "sub-105", code: "CRY-00105", name: "Sanjay Gupta" },
  ];

  // ─── Data Fetching ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/grace-periods");
        if (!res.ok) throw new Error("Failed to fetch grace periods");
        const data = await res.json();
        setGracePeriods(Array.isArray(data) ? data : data.data ?? data.gracePeriods ?? FALLBACK_DATA);
      } catch (err) {
        // logger
        setError(err instanceof Error ? err.message : "Unknown error");
        setGracePeriods(FALLBACK_DATA);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  function handleSubscriberLookup(query: string) {
    setSubscriberSearch(query);
    if (query.length >= 2) {
      const results = demoSubscribers.filter(
        (s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.code.toLowerCase().includes(query.toLowerCase()),
      );
      setSubscriberResults(results);
      setShowDropdown(results.length > 0);
    } else {
      setShowDropdown(false);
    }
  }

  function selectSubscriber(sub: { id: string; code: string; name: string }) {
    setForm((prev) => ({ ...prev, subscriberId: sub.id, subscriberCode: sub.code, subscriberName: sub.name }));
    setSubscriberSearch(sub.name);
    setShowDropdown(false);
  }

  // Filter & Paginate
  const filtered = useMemo(() => {
    return gracePeriods.filter((gp) => {
      if (statusFilter !== "ALL" && gp.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && gp.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return gp.subscriberName.toLowerCase().includes(q) || gp.subscriberCode.toLowerCase().includes(q) || gp.reason.toLowerCase().includes(q);
      }
      return true;
    });
  }, [gracePeriods, search, statusFilter, typeFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleApply() {
    if (!form.subscriberId) { toast.error("Please select a subscriber"); return; }
    if (!form.reason.trim()) { toast.error("Please provide a reason"); return; }
    if (form.graceDays < 1) { toast.error("Grace days must be at least 1"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/grace-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to apply grace period");
      const data = await res.json();
      setGracePeriods((prev) => [data, ...prev]);
      setApplyOpen(false);
      setForm({ subscriberId: "", subscriberCode: "", subscriberName: "", graceDays: 7, type: "PAYMENT", reason: "" });
      setSubscriberSearch("");
      toast.success(`Grace period of ${form.graceDays} days applied to ${form.subscriberName}`);
    } catch (err) {
      toast.error("Failed to apply grace period");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    setLoading(true);
    try {
      await fetch(`/api/grace-periods?id=${selectedId}`, { method: "DELETE" });
      setGracePeriods((prev) => prev.map((gp) => gp.id === selectedId ? { ...gp, status: "CANCELLED" as const } : gp));
      setCancelOpen(false);
      setSelectedId(null);
      toast.success("Grace period cancelled successfully");
    } catch {
      toast.error("Failed to cancel grace period");
    } finally {
      setLoading(false);
    }
  }

  function openUpdateStatus(id: string, name: string) {
    setSelectedId(id);
    setSelectedName(name);
    setUpdateStatus({ id, status: "COMPLETED" });
    setUpdateStatusOpen(true);
  }

  async function handleUpdateStatus() {
    if (!selectedId) return;
    setLoading(true);
    try {
      await fetch(`/api/grace-periods?id=${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: updateStatus.status }),
      });
      setGracePeriods((prev) => prev.map((gp) => gp.id === selectedId ? { ...gp, status: updateStatus.status as GracePeriod["status"] } : gp));
      setUpdateStatusOpen(false);
      setSelectedId(null);
      setSelectedName("");
      toast.success(`Status updated to ${updateStatus.status} for ${selectedName}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setLoading(false);
    }
  }

  // Stats
  const activeCount = gracePeriods.filter((g) => g.status === "ACTIVE").length;
  const expiredCount = gracePeriods.filter((g) => g.status === "EXPIRED").length;
  const completedCount = gracePeriods.filter((g) => g.status === "COMPLETED").length;
  const cancelledCount = gracePeriods.filter((g) => g.status === "CANCELLED").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Grace Periods"
        description="Manage subscriber grace periods for payment delays, complaints, and suspensions."
        icon={Clock}
        actions={
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setApplyOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Apply Grace Period
          </Button>
        }
      />

      {/* Error Banner */}
      {error && (
        <Card className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">Showing demo data — API unavailable: {error}</p>
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => window.location.reload()}>
              <RefreshCcw className="h-3 w-3 mr-1" />Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="h-16 w-full rounded-lg" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><Clock className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{activeCount}</p>
                    <p className="text-xs text-muted-foreground font-medium">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-700/40 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/50 dark:to-gray-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-500 to-gray-600 shadow-sm shadow-slate-500/25"><AlertTriangle className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-slate-700 dark:text-slate-300">{expiredCount}</p>
                    <p className="text-xs text-muted-foreground font-medium">Expired</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-teal-200/60 dark:ring-teal-800/40 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/50 dark:to-cyan-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-sm shadow-teal-500/25"><CheckCircle2 className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">{completedCount}</p>
                    <p className="text-xs text-muted-foreground font-medium">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-gray-200/60 dark:ring-gray-700/40 bg-gradient-to-br from-gray-50 to-zinc-50 dark:from-gray-950/50 dark:to-zinc-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-gray-400 to-zinc-500 shadow-sm shadow-gray-400/25"><Ban className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-gray-600 dark:text-gray-400">{cancelledCount}</p>
                    <p className="text-xs text-muted-foreground font-medium">Cancelled</p>
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
              <Input placeholder="Search by subscriber name, code, or reason..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="PAYMENT">Payment</SelectItem>
                <SelectItem value="SUSPENSION">Suspension</SelectItem>
                <SelectItem value="COMPLAINT">Complaint</SelectItem>
                <SelectItem value="CUSTOM">Custom</SelectItem>
              </SelectContent>
            </Select>
            {(search || statusFilter !== "ALL" || typeFilter !== "ALL") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("ALL"); setTypeFilter("ALL"); setPage(1); }}>
                <X className="h-4 w-4 mr-1" />Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Loading grace periods...</span>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Subscriber</TableHead>
                      <TableHead className="text-xs">Grace Days</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Suspension Date</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Expiry</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Reason</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No grace periods found.</TableCell></TableRow>
                    ) : (
                      paginated.map((gp) => {
                        const daysRemaining = getDaysRemaining(gp.expiryDate, gp.status);
                        return (
                          <TableRow key={gp.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800"><User className="h-4 w-4 text-muted-foreground" /></div>
                                <div>
                                  <div className="text-xs font-medium">{gp.subscriberName}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{gp.subscriberCode}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm font-medium tabular-nums">{gp.graceDays} days</span>
                                {daysRemaining !== null && (
                                  <span className={`text-[10px] font-medium ml-1 ${daysRemaining <= 2 ? "text-red-600" : daysRemaining <= 5 ? "text-amber-600" : "text-green-600"}`}>
                                    ({daysRemaining}d left)
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{getTypeBadge(gp.type)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                              {gp.suspensionDate ? new Date(gp.suspensionDate).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                              {new Date(gp.expiryDate).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-xs hidden lg:table-cell max-w-[200px] truncate" title={gp.reason}>
                              {gp.reason}
                            </TableCell>
                            <TableCell>{getStatusBadge(gp.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {gp.status === "ACTIVE" && (
                                  <>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:text-green-700" onClick={() => openUpdateStatus(gp.id, gp.subscriberName)}>
                                      <ArrowRight className="h-3.5 w-3.5 mr-1" />Update
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => { setSelectedId(gp.id); setCancelOpen(true); }}>
                                      <Ban className="h-3.5 w-3.5 mr-1" />Cancel
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
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
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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

      {/* Apply Grace Period Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Apply Grace Period</DialogTitle>
            <DialogDescription>Grant a grace period to a subscriber to delay suspension actions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2 relative">
              <Label>Subscriber</Label>
              {form.subscriberId ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-center h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800"><User className="h-3.5 w-3.5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{form.subscriberName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{form.subscriberCode}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setForm((p) => ({ ...p, subscriberId: "", subscriberCode: "", subscriberName: "" })); setSubscriberSearch(""); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search subscriber by name or code..." value={subscriberSearch} onChange={(e) => handleSubscriberLookup(e.target.value)} className="pl-9" />
                  {showDropdown && (
                    <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-48 overflow-y-auto">
                      {subscriberResults.map((sub) => (
                        <button key={sub.id} className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2" onClick={() => selectSubscriber(sub)}>
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <div className="text-xs font-medium">{sub.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{sub.code}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Grace Days</Label>
                <Input type="number" min={1} max={90} value={form.graceDays} onChange={(e) => setForm((p) => ({ ...p, graceDays: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as GracePeriodFormData["type"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAYMENT">Payment</SelectItem>
                    <SelectItem value="SUSPENSION">Suspension</SelectItem>
                    <SelectItem value="COMPLAINT">Complaint</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea placeholder="Enter reason for granting grace period..." value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleApply} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              Apply Grace Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={updateStatusOpen} onOpenChange={setUpdateStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRight className="h-5 w-5" />Update Grace Period Status</DialogTitle>
            <DialogDescription>Change the status for <span className="font-semibold">{selectedName}</span>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={updateStatus.status} onValueChange={(v) => setUpdateStatus((p) => ({ ...p, status: v as UpdateStatusData["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />Completed</div>
                  </SelectItem>
                  <SelectItem value="CANCELLED">
                    <div className="flex items-center gap-2"><Ban className="h-3.5 w-3.5 text-gray-500" />Cancelled</div>
                  </SelectItem>
                  <SelectItem value="EXPIRED">
                    <div className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-slate-500" />Expired</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {updateStatus.status === "CANCELLED" && (
              <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
                <p className="text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
                  Cancelling will immediately trigger suspension for this subscriber.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateStatusOpen(false)}>Cancel</Button>
            <Button
              className={updateStatus.status === "CANCELLED" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}
              onClick={handleUpdateStatus}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirm Dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Grace Period</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to cancel this grace period? The subscriber&apos;s suspension will take effect immediately. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Active</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCancel}>Cancel Grace Period</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
