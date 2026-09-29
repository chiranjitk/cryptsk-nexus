"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  DollarSign, Plus, Search, Edit, Trash2, Filter, RefreshCw,
  CheckCircle2, XCircle, Calendar, Eye,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────
interface ChargeOverride {
  id: string;
  subscriberId: string;
  subscriberName: string;
  subscriberCode: string;
  planName: string;
  originalPrice: number;
  overridePrice: number;
  validFrom: string;
  validUntil: string | null;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "SCHEDULED";
  reason: string;
  createdAt: string;
}

interface ChargeOverrideFormData {
  subscriberId: string;
  overridePrice: number;
  validFrom: string;
  validUntil: string;
  reason: string;
}

interface SubscriberSearchResult {
  id: string;
  name: string;
  code: string;
  planName: string;
  planPrice: number;
}

const PAGE_SIZE = 15;

// ─── Component ────────────────────────────────────────────────────
export default function ChargeOverridesPage() {
  const [overrides, setOverrides] = useState<ChargeOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedOverride, setSelectedOverride] = useState<ChargeOverride | null>(null);
  const [form, setForm] = useState<ChargeOverrideFormData>({
    subscriberId: "",
    overridePrice: 0,
    validFrom: new Date().toISOString().split("T")[0],
    validUntil: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  // Subscriber search in dialog
  const [subSearch, setSubSearch] = useState("");
  const [subResults, setSubResults] = useState<SubscriberSearchResult[]>([]);
  const [selectedSub, setSelectedSub] = useState<SubscriberSearchResult | null>(null);
  const [searchingSub, setSearchingSub] = useState(false);

  // ─── Data Fetching ───
  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (showActiveOnly) params.set("active", "true");
      params.set("page", page.toString());
      params.set("limit", PAGE_SIZE.toString());

      const data = await apiFetch<{ overrides: ChargeOverride[]; totalPages: number }>(
        `/api/charge-overrides?${params.toString()}`
      );
      setOverrides(data.overrides || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      toast.error("Failed to load charge overrides");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, showActiveOnly, page]);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);

  // ─── Subscriber search in dialog ───
  async function searchSubscribers() {
    if (!subSearch.trim()) return;
    setSearchingSub(true);
    try {
      const data = await apiFetch<{ subscribers: SubscriberSearchResult[] }>(
        `/api/subscribers?search=${encodeURIComponent(subSearch)}&limit=5`
      );
      setSubResults(data.subscribers || []);
    } catch {
      toast.error("Failed to search subscribers");
    } finally {
      setSearchingSub(false);
    }
  }

  // ─── CRUD ───
  function openCreate() {
    setForm({
      subscriberId: "",
      overridePrice: 0,
      validFrom: new Date().toISOString().split("T")[0],
      validUntil: "",
      reason: "",
    });
    setSelectedSub(null);
    setSubSearch("");
    setSubResults([]);
    setCreateDialogOpen(true);
  }

  function openEdit(override: ChargeOverride) {
    setSelectedOverride(override);
    setForm({
      subscriberId: override.subscriberId,
      overridePrice: override.overridePrice,
      validFrom: override.validFrom.split("T")[0],
      validUntil: override.validUntil ? override.validUntil.split("T")[0] : "",
      reason: override.reason,
    });
    setSelectedSub({
      id: override.subscriberId,
      name: override.subscriberName,
      code: override.subscriberCode,
      planName: override.planName,
      planPrice: override.originalPrice,
    });
    setEditDialogOpen(true);
  }

  async function saveCreate() {
    if (!form.subscriberId || form.overridePrice <= 0) {
      toast.error("Select a subscriber and enter a valid price");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/charge-overrides", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast.success("Charge override created successfully");
      setCreateDialogOpen(false);
      fetchOverrides();
    } catch {
      toast.error("Failed to create charge override");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!selectedOverride || form.overridePrice <= 0) {
      toast.error("Enter a valid override price");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/charge-overrides/${selectedOverride.id}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      toast.success("Charge override updated");
      setEditDialogOpen(false);
      fetchOverrides();
    } catch {
      toast.error("Failed to update charge override");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOverride() {
    if (!selectedOverride) return;
    try {
      await apiFetch(`/api/charge-overrides/${selectedOverride.id}`, { method: "DELETE" });
      toast.success("Charge override deleted");
      setDeleteDialogOpen(false);
      setSelectedOverride(null);
      fetchOverrides();
    } catch {
      toast.error("Failed to delete charge override");
    }
  }

  // ─── Helpers ───
  function isActive(override: ChargeOverride) {
    const now = new Date();
    const from = new Date(override.validFrom);
    const until = override.validUntil ? new Date(override.validUntil) : null;
    return override.status === "ACTIVE" && from <= now && (!until || until >= now);
  }

  function statusBadge(status: string) {
    const map: Record<string, { label: string; cls: string }> = {
      ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
      EXPIRED: { label: "Expired", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400" },
      CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
      SCHEDULED: { label: "Scheduled", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
    };
    const entry = map[status] || { label: status, cls: "" };
    return <Badge className={`${entry.cls} text-[10px]`}>{entry.label}</Badge>;
  }

  // ─── Loading ───
  if (loading && page === 1) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <Skeleton className="skeleton-wave h-10 w-full" />
        <Skeleton className="skeleton-wave h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="Charge Overrides"
        description="Manage custom pricing overrides for subscribers. Set special pricing for promotions, loyalty discounts, or billing adjustments."
        icon={DollarSign}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={showActiveOnly ? "default" : "outline"}
              size="sm"
              onClick={() => { setShowActiveOnly(!showActiveOnly); setPage(1); }}
            >
              <Eye className="h-4 w-4 mr-2" />
              {showActiveOnly ? "All Overrides" : "Active Overrides"}
            </Button>
            <Button variant="outline" onClick={fetchOverrides} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />New Override
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search subscriber by name or code..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <div className="grid gap-1.5">
              <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Subscriber</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Original Price</TableHead>
                  <TableHead className="text-xs">Override Price</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Valid From</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Valid Until</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {showActiveOnly ? "No active overrides found." : "No charge overrides configured. Create one to set custom pricing for subscribers."}
                    </TableCell>
                  </TableRow>
                ) : (
                  overrides.map((override) => (
                    <TableRow
                      key={override.id}
                      className={`hover:bg-muted/50 transition-colors duration-150 ${isActive(override) ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isActive(override) && <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                          <div>
                            <div className="text-sm font-medium">{override.subscriberName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{override.subscriberCode}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{override.planName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground line-through">{formatINR(override.originalPrice)}</TableCell>
                      <TableCell className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{formatINR(override.overridePrice)}</TableCell>
                      <TableCell className="text-xs hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {new Date(override.validFrom).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell">
                        {override.validUntil ? (
                          new Date(override.validUntil).toLocaleDateString()
                        ) : (
                          <Badge variant="outline" className="text-[10px]">No end date</Badge>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(override.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {override.status === "ACTIVE" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(override)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {override.status !== "CANCELLED" && override.status !== "EXPIRED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              onClick={() => { setSelectedOverride(override); setDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Create Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Charge Override</DialogTitle>
            <DialogDescription>Set a custom price for a subscriber, optionally with a validity period.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Subscriber search */}
            <div className="grid gap-2">
              <Label className="text-xs font-medium">Search Subscriber</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Name or code..."
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchSubscribers()}
                />
                <Button variant="outline" onClick={searchSubscribers} disabled={searchingSub}>Search</Button>
              </div>
              {subResults.length > 0 && !selectedSub && (
                <div className="border rounded-lg max-h-32 overflow-y-auto">
                  {subResults.map((sub) => (
                    <button
                      key={sub.id}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b last:border-0 flex items-center justify-between"
                      onClick={() => {
                        setSelectedSub(sub);
                        setForm({ ...form, subscriberId: sub.id });
                        setSubResults([]);
                      }}
                    >
                      <div>
                        <span className="font-medium">{sub.name}</span>
                        <span className="text-muted-foreground ml-2 font-mono">{sub.code}</span>
                      </div>
                      <span className="text-muted-foreground">{sub.planName} — {formatINR(sub.planPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedSub && (
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <div className="text-xs">
                    <span className="font-medium">{selectedSub.name}</span>
                    <span className="text-muted-foreground ml-1">({selectedSub.code})</span>
                    <span className="text-muted-foreground ml-2">Plan: {selectedSub.planName}</span>
                    <span className="text-muted-foreground ml-2">Original: {formatINR(selectedSub.planPrice)}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => { setSelectedSub(null); setForm({ ...form, subscriberId: "" }); }}>
                    Change
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="override-price">Override Price (₹)</Label>
              <Input
                id="override-price"
                type="number"
                value={form.overridePrice || ""}
                onChange={(e) => setForm({ ...form, overridePrice: parseFloat(e.target.value) || 0 })}
                placeholder="Enter override price"
              />
              {selectedSub && selectedSub.planPrice > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Original: {formatINR(selectedSub.planPrice)} → {form.overridePrice > 0 ? (
                    <span className={form.overridePrice < selectedSub.planPrice ? "text-emerald-600" : form.overridePrice > selectedSub.planPrice ? "text-red-600" : ""}>
                      {form.overridePrice < selectedSub.planPrice ? "Discount" : form.overridePrice > selectedSub.planPrice ? "Surcharge" : "Same"}: {formatINR(Math.abs(selectedSub.planPrice - form.overridePrice))}
                    </span>
                  ) : "—"}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="valid-from">Valid From</Label>
                <Input id="valid-from" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="valid-until">Valid Until</Label>
                <Input id="valid-until" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="override-reason">Reason</Label>
              <Textarea id="override-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g., Loyalty discount, promotional offer..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Charge Override</DialogTitle>
            <DialogDescription>Update pricing or validity for this override.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {selectedSub && (
              <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
                <div className="text-xs">
                  <span className="font-medium">{selectedSub.name}</span>
                  <span className="text-muted-foreground ml-1">({selectedSub.code})</span>
                  <span className="text-muted-foreground ml-2">Plan: {selectedSub.planName}</span>
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="edit-price">Override Price (₹)</Label>
              <Input
                id="edit-price"
                type="number"
                value={form.overridePrice || ""}
                onChange={(e) => setForm({ ...form, overridePrice: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="edit-from">Valid From</Label>
                <Input id="edit-from" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-until">Valid Until</Label>
                <Input id="edit-until" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-reason">Reason</Label>
              <Textarea id="edit-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveEdit} disabled={saving}>
              {saving ? "Saving..." : "Update Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Charge Override</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the charge override for <strong>{selectedOverride?.subscriberName}</strong>.
              The subscriber will revert to the original plan pricing of {formatINR(selectedOverride?.originalPrice || 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Override</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={deleteOverride}>
              Cancel Override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
