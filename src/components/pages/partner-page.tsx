"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Handshake, Plus, Pencil, Trash2, Search, Loader2, Users, UserCircle,
  MapPin, Network, Eye, Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface PartnerIpPool {
  id: string;
  poolType: string;
  startIp: string;
  endIp: string;
  description: string;
}

interface PartnerPortalMapping {
  id: string;
  portalTemplate: string;
  captivePortalId: string | null;
  CaptivePortal?: { id: string; name: string } | null;
}

interface Partner {
  id: string;
  distributionHubId: string;
  name: string;
  code: string;
  description: string;
  status: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  logoUrl: string;
  primaryColor: string;
  customDomain: string;
  distributionHub?: { id: string; name: string; code: string };
  subscriberCount: number;
  partnerUserCount: number;
  ipPoolCount: number;
  ipPools?: PartnerIpPool[];
  portalMappings?: PartnerPortalMapping[];
  createdAt: string;
  updatedAt: string;
}

interface DistributionHub {
  id: string;
  name: string;
  code: string;
  status: string;
  partnerCount: number;
}

const emptyForm = {
  name: "",
  code: "",
  description: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  address: "",
  distributionHubId: "",
  status: "ACTIVE",
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  INACTIVE: "bg-gray-100 text-gray-600 border-gray-200",
};

// ─── Component ──────────────────────────────────────────────

export default function PartnerPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [filterHubId, setFilterHubId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // ── Queries ──
  const buildPartnerQuery = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterHubId !== "all") params.set("distributionHubId", filterHubId);
    if (filterStatus !== "all") params.set("status", filterStatus);
    return params.toString();
  };

  const { data: partnersData, isLoading } = useQuery<{ partners: Partner[]; total: number }>({
    queryKey: ["partners", search, filterHubId, filterStatus],
    queryFn: async () => apiFetch(`/api/partners?${buildPartnerQuery()}`),
  });

  const { data: hubsData } = useQuery<{ hubs: DistributionHub[] }>({
    queryKey: ["distribution-hubs-list"],
    queryFn: async () => apiFetch("/api/distribution-hubs"),
  });

  const { data: partnerDetail } = useQuery<{ partner: Partner }>({
    queryKey: ["partner-detail", detailId],
    queryFn: async () => apiFetch(`/api/partners/${detailId}`),
    enabled: !!detailId,
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) =>
      apiFetch("/api/partners", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Partner created");
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create partner"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof emptyForm }) =>
      apiFetch(`/api/partners/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Partner updated");
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update partner"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiFetch(`/api/partners/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Partner deactivated");
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete partner"),
  });

  // ── Handlers ──
  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (partner: Partner) => {
    setForm({
      name: partner.name,
      code: partner.code,
      description: partner.description,
      contactName: partner.contactName,
      contactPhone: partner.contactPhone,
      contactEmail: partner.contactEmail,
      address: partner.address,
      distributionHubId: partner.distributionHubId,
      status: partner.status,
    });
    setEditingId(partner.id);
    setDialogOpen(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim() || !form.distributionHubId) {
      toast.error("Name, code and distribution hub are required");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const partners = partnersData?.partners || [];
  const hubs = hubsData?.hubs || [];

  const totalSubscribers = partners.reduce((s, p) => s + p.subscriberCount, 0);
  const totalUsers = partners.reduce((s, p) => s + p.partnerUserCount, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partners</h1>
          <p className="text-sm text-muted-foreground">
            Channel partners grouped under distribution hubs
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2" disabled={hubs.length === 0}>
          <Plus className="h-4 w-4" />
          New Partner
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
              <Handshake className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Partners</p>
              <p className="text-2xl font-bold tabular-nums">{partners.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Subscribers</p>
              <p className="text-2xl font-bold tabular-nums">{totalSubscribers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700">
              <UserCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Partner Users</p>
              <p className="text-2xl font-bold tabular-nums">{totalUsers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, code, contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterHubId} onValueChange={setFilterHubId}>
          <SelectTrigger className="w-[200px]">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by hub" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hubs</SelectItem>
            {hubs.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name} ({h.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Partners</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : partners.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Handshake className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No partners found.</p>
              {hubs.length === 0 && (
                <p className="text-xs mt-1">Create a distribution hub first.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Distribution Hub</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Subs</TableHead>
                    <TableHead className="text-center">Users</TableHead>
                    <TableHead className="text-center">IP Pools</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.code}</code>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.distributionHub ? (
                          <span>{p.distributionHub.name}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.contactName ? (
                          <div>
                            <div>{p.contactName}</div>
                            <div className="text-xs text-muted-foreground">{p.contactPhone}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[p.status] || STATUS_STYLES.INACTIVE}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{p.subscriberCount}</TableCell>
                      <TableCell className="text-center tabular-nums">{p.partnerUserCount}</TableCell>
                      <TableCell className="text-center tabular-nums">{p.ipPoolCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailId(p.id)}
                            aria-label="View partner"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(p)}
                            aria-label="Edit partner"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(p.id)}
                            aria-label="Deactivate partner"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Partner" : "Create Partner"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update partner details."
                : "Register a new channel partner under a distribution hub."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. ABC Cable"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. ABC-CBL"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="distributionHubId">Distribution Hub *</Label>
              <Select
                value={form.distributionHubId}
                onValueChange={(v) => setForm({ ...form, distributionHubId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a distribution hub" />
                </SelectTrigger>
                <SelectContent>
                  {hubs.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name} ({h.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description (optional)"
                rows={2}
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactName">Contact Name</Label>
                <Input
                  id="contactName"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  placeholder="Contact person"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Contact Phone</Label>
                <Input
                  id="contactPhone"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  placeholder="+91..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                placeholder="contact@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Business address"
                rows={2}
              />
            </div>
            {editingId && (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="gap-2"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {editingId ? "Save Changes" : "Create Partner"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Partner Details</DialogTitle>
            <DialogDescription>
              Detailed view of the selected partner
            </DialogDescription>
          </DialogHeader>
          {partnerDetail?.partner ? (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <p className="font-medium">{partnerDetail.partner.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Code</Label>
                  <p className="font-medium">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {partnerDetail.partner.code}
                    </code>
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Distribution Hub</Label>
                  <p className="font-medium">
                    {partnerDetail.partner.distributionHub?.name || "—"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Badge className={STATUS_STYLES[partnerDetail.partner.status] || STATUS_STYLES.INACTIVE}>
                    {partnerDetail.partner.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Contact Name</Label>
                  <p className="font-medium">{partnerDetail.partner.contactName || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Contact Phone</Label>
                  <p className="font-medium">{partnerDetail.partner.contactPhone || "—"}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Contact Email</Label>
                  <p className="font-medium">{partnerDetail.partner.contactEmail || "—"}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <p className="font-medium">{partnerDetail.partner.address || "—"}</p>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-3 pt-2 border-t">
                <div className="text-center">
                  <Users className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                  <p className="text-2xl font-bold">{partnerDetail.partner.subscriberCount}</p>
                  <p className="text-xs text-muted-foreground">Subscribers</p>
                </div>
                <div className="text-center">
                  <UserCircle className="h-5 w-5 mx-auto mb-1 text-purple-600" />
                  <p className="text-2xl font-bold">{partnerDetail.partner.partnerUserCount}</p>
                  <p className="text-xs text-muted-foreground">Partner Users</p>
                </div>
                <div className="text-center">
                  <Network className="h-5 w-5 mx-auto mb-1 text-amber-600" />
                  <p className="text-2xl font-bold">
                    {partnerDetail.partner.ipPools?.length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">IP Pools</p>
                </div>
              </div>
              {partnerDetail.partner.ipPools && partnerDetail.partner.ipPools.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">IP Pools</Label>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {partnerDetail.partner.ipPools.map((pool) => (
                      <div
                        key={pool.id}
                        className="flex justify-between items-center text-sm bg-muted/40 px-3 py-1.5 rounded"
                      >
                        <span className="font-mono">{pool.startIp} — {pool.endIp}</span>
                        <Badge variant="outline">{pool.poolType}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {partnerDetail.partner.portalMappings && partnerDetail.partner.portalMappings.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Portal Mappings</Label>
                  <div className="mt-2 space-y-1">
                    {partnerDetail.partner.portalMappings.map((m) => (
                      <div
                        key={m.id}
                        className="flex justify-between items-center text-sm bg-muted/40 px-3 py-1.5 rounded"
                      >
                        <span>{m.CaptivePortal?.name || "Default"}</span>
                        <Badge variant="outline">{m.portalTemplate}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Partner?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the partner as INACTIVE. Subscribers, partner users, IP pools and
              portal mappings will not be deleted. You can reactivate the partner later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
