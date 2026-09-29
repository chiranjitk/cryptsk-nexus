"use client";

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Tag, Plus, Pencil, Trash2, Loader2, Gift, Calendar, Search,
  ChevronLeft, ChevronRight, Power, PowerOff, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

interface PromotionItem {
  id: string;
  code: string;
  description: string;
  type: string;
  value: number;
  minAmount: number;
  maxDiscount: number | null;
  validFrom: string;
  validUntil: string;
  usageLimit: number | null;
  usedCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface StatusCounts {
  active: number;
  expired: number;
  depleted: number;
}

// ─── Constants ────────────────────────────────────────────────

const TYPES = ["PERCENTAGE", "FLAT", "FREE_TRIAL"];
const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "EXPIRED", label: "Expired" },
  { key: "DEPLETED", label: "Depleted" },
];

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  EXPIRED: "bg-gray-100 text-gray-600 border-gray-200",
  DEPLETED: "bg-red-100 text-red-700 border-red-200",
};

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatValue(type: string, value: number): string {
  if (type === "PERCENTAGE") return `${value}%`;
  if (type === "FREE_TRIAL") return `${value} day${value !== 1 ? "s" : ""}`;
  return formatINR(value);
}

const emptyForm = {
  code: "", description: "", type: "PERCENTAGE" as string, value: 0, minAmount: 0,
  maxDiscount: null as number | null, validFrom: "", validUntil: "", usageLimit: null as number | null,
};

// ─── Component ────────────────────────────────────────────────

export default function PromotionsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  // ── Queries ──

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params.toString();
  }, [statusFilter, search, page]);

  const { data, isLoading } = useQuery<{
    items: PromotionItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    statusCounts: StatusCounts;
  }>({
    queryKey: ["promotions", statusFilter, search, page],
    queryFn: async () => {
      return apiFetch(`/api/promotions?${buildQueryParams()}`);
    },
  });

  const promotions = data?.items || [];
  const pagination = data?.pagination;
  const statusCounts = data?.statusCounts || { active: 0, expired: 0, depleted: 0 };

  // ── Mutations ──

  const createMutation = useMutation({
    mutationFn: async (body: typeof emptyForm) => {
      return apiFetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success("Promotion created");
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create promotion"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: typeof emptyForm & { id: string }) => {
      return apiFetch(`/api/promotions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success("Promotion updated");
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update promotion"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/promotions/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Promotion deleted");
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete promotion"),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/promotions/${id}/toggle-status`, { method: "POST" });
    },
    onSuccess: () => {
      toast.success("Promotion status toggled");
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to toggle status"),
  });

  // ── Handlers ──

  const handleSubmit = () => {
    if (!form.code.trim()) { toast.error("Promo code is required."); return; }
    if (form.value <= 0) { toast.error("Value must be greater than 0."); return; }
    if (!form.validFrom || !form.validUntil) { toast.error("Valid from and until dates are required."); return; }
    if (form.validUntil <= form.validFrom) { toast.error("Valid until must be after valid from."); return; }
    if (form.type === "PERCENTAGE" && form.value > 100) { toast.error("Percentage cannot exceed 100."); return; }

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const openEdit = (p: PromotionItem) => {
    setForm({
      code: p.code, description: p.description, type: p.type, value: p.value, minAmount: p.minAmount,
      maxDiscount: p.maxDiscount, validFrom: p.validFrom.split("T")[0], validUntil: p.validUntil.split("T")[0], usageLimit: p.usageLimit,
    });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  // ── Detail dialog ──

  const detailPromo = detailId ? promotions.find((p) => p.id === detailId) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Promotions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage promotional offers, discounts, and coupons.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by code, description..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-9 w-full sm:w-56"
            />
          </div>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Promotion
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilterChange(statusFilter === "ACTIVE" ? "all" : "ACTIVE")}>
          <CardContent className="p-4 text-center">
            <Gift className="h-5 w-5 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-600">{statusCounts.active}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilterChange(statusFilter === "EXPIRED" ? "all" : "EXPIRED")}>
          <CardContent className="p-4 text-center">
            <Calendar className="h-5 w-5 text-gray-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-600">{statusCounts.expired}</p>
            <p className="text-xs text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilterChange(statusFilter === "DEPLETED" ? "all" : "DEPLETED")}>
          <CardContent className="p-4 text-center">
            <Tag className="h-5 w-5 text-red-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-600">{statusCounts.depleted}</p>
            <p className="text-xs text-muted-foreground">Depleted</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4 text-red-600" />
              Promotions ({pagination?.total || 0})
            </CardTitle>
            {/* Status filter tabs */}
            <div className="flex gap-1">
              {STATUS_TABS.map((tab) => (
                <Button
                  key={tab.key}
                  size="sm"
                  variant={statusFilter === tab.key ? "default" : "outline"}
                  className={
                    statusFilter === tab.key
                      ? "bg-red-600 hover:bg-red-700 text-white h-7 text-xs px-2.5"
                      : "h-7 text-xs px-2.5"
                  }
                  onClick={() => handleStatusFilterChange(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Value</TableHead>
                    <TableHead className="text-xs">Valid Period</TableHead>
                    <TableHead className="text-xs">Usage</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                        {search || statusFilter !== "all" ? "No promotions match your filters." : "No promotions created yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    promotions.map((p) => {
                      const usagePercent = p.usageLimit ? (p.usedCount / p.usageLimit) * 100 : 0;
                      return (
                        <TableRow key={p.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell className="text-sm font-mono font-semibold">{p.code}</TableCell>
                          <TableCell className="text-sm max-w-[150px] truncate">{p.description || "-"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{p.type.replace("_", " ")}</Badge></TableCell>
                          <TableCell className="text-sm font-semibold">{formatValue(p.type, p.value)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.validFrom)} – {formatDate(p.validUntil)}</TableCell>
                          <TableCell>
                            <div className="space-y-1 min-w-[100px]">
                              <div className="flex justify-between text-[10px]">
                                <span>{p.usedCount}</span>
                                <span className="text-muted-foreground">{p.usageLimit || "Unlimited"}</span>
                              </div>
                              {p.usageLimit ? (
                                <Progress value={usagePercent} className="h-1.5" />
                              ) : (
                                <div className="h-1.5" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[p.status] || ""}`}>{p.status}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View Details" onClick={() => setDetailId(p.id)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="h-7 w-7 p-0"
                                title={p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                                disabled={p.status === "DEPLETED" || toggleMutation.isPending}
                                onClick={() => toggleMutation.mutate(p.id)}
                              >
                                {toggleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                                  p.status === "ACTIVE" ? <PowerOff className="h-3.5 w-3.5 text-orange-500" /> : <Power className="h-3.5 w-3.5 text-green-500" />}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" title="Delete" onClick={() => setDeleteId(p.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm" variant="outline" className="h-8 w-8 p-0"
                      disabled={pagination.page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.page <= 3) {
                        pageNum = i + 1;
                      } else if (pagination.page >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = pagination.page - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          size="sm"
                          variant={pagination.page === pageNum ? "default" : "outline"}
                          className={pagination.page === pageNum ? "bg-red-600 hover:bg-red-700 text-white h-8 w-8 p-0" : "h-8 w-8 p-0"}
                          onClick={() => setPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      size="sm" variant="outline" className="h-8 w-8 p-0"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{editingId ? "Edit" : "Add"} Promotion</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Promo Code *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE20" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Value *</Label>
                <Input type="number" min="1" max={form.type === "PERCENTAGE" ? "100" : undefined} value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min Amount (₹)</Label>
                <Input type="number" min="0" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max Discount (₹)</Label>
                <Input type="number" min="0" value={form.maxDiscount || ""} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Valid From *</Label>
                <Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valid Until *</Label>
                <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Usage Limit (empty for unlimited)</Label>
              <Input type="number" min="1" value={form.usageLimit || ""} onChange={(e) => setForm({ ...form, usageLimit: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={handleSubmit}
              >
                {(createMutation.isPending || updateMutation.isPending)
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</>
                  : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">Promotion Details</DialogTitle></DialogHeader>
          {detailPromo ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Code:</span><p className="font-mono font-bold">{detailPromo.code}</p></div>
                <div><span className="text-muted-foreground">Type:</span><p className="font-semibold">{detailPromo.type.replace("_", " ")}</p></div>
                <div><span className="text-muted-foreground">Value:</span><p className="font-semibold">{formatValue(detailPromo.type, detailPromo.value)}</p></div>
                <div><span className="text-muted-foreground">Status:</span><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[detailPromo.status] || ""}`}>{detailPromo.status}</Badge></div>
                <div><span className="text-muted-foreground">Min Amount:</span><p>{formatINR(detailPromo.minAmount)}</p></div>
                <div><span className="text-muted-foreground">Max Discount:</span><p>{detailPromo.maxDiscount ? formatINR(detailPromo.maxDiscount) : "None"}</p></div>
                <div><span className="text-muted-foreground">Valid From:</span><p>{formatDate(detailPromo.validFrom)}</p></div>
                <div><span className="text-muted-foreground">Valid Until:</span><p>{formatDate(detailPromo.validUntil)}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Description:</span><p>{detailPromo.description || "—"}</p></div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Usage:</span>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{detailPromo.usedCount} used</span>
                      <span>{detailPromo.usageLimit ? `of ${detailPromo.usageLimit}` : "Unlimited"}</span>
                    </div>
                    {detailPromo.usageLimit ? <Progress value={(detailPromo.usedCount / detailPromo.usageLimit) * 100} className="h-2" /> : null}
                  </div>
                </div>
                <div><span className="text-muted-foreground">Created:</span><p>{formatDate(detailPromo.createdAt)}</p></div>
                <div><span className="text-muted-foreground">Updated:</span><p>{formatDate(detailPromo.updatedAt)}</p></div>
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => { setDetailId(null); openEdit(detailPromo); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">Promotion not found.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Promotion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this promotion? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Deleting...</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
