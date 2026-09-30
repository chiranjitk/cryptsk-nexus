"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  UserCircle, Plus, Pencil, Trash2, Search, Loader2, Mail, Phone, Shield,
  CheckCircle2, Lock, KeyRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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

interface PartnerUser {
  id: string;
  partnerId: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  loginAttempts: number;
  lockedUntil: string | null;
  partner?: { id: string; name: string; code: string };
  permissionCount: number;
  createdAt: string;
}

interface Partner {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface PartnerPermission {
  id: string;
  key: string;
  description: string;
  category: string;
}

interface AssignedPermission {
  assignmentId: string;
  partnerPermissionId: string;
  permission: {
    id: string;
    key: string;
    description: string;
    category: string;
  };
}

const emptyForm = {
  email: "",
  password: "",
  name: "",
  phone: "",
  role: "READONLY_USER",
  partnerId: "",
  status: "ACTIVE",
};

const ROLE_OPTIONS = [
  { value: "PARTNER_ADMIN", label: "Partner Admin" },
  { value: "BILLING_USER", label: "Billing User" },
  { value: "SUPPORT_USER", label: "Support User" },
  { value: "READONLY_USER", label: "Readonly User" },
];

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  INACTIVE: "bg-gray-100 text-gray-600 border-gray-200",
  LOCKED: "bg-red-100 text-red-700 border-red-200",
};

const ROLE_STYLES: Record<string, string> = {
  PARTNER_ADMIN: "bg-amber-100 text-amber-700 border-amber-200",
  BILLING_USER: "bg-blue-100 text-blue-700 border-blue-200",
  SUPPORT_USER: "bg-purple-100 text-purple-700 border-purple-200",
  READONLY_USER: "bg-gray-100 text-gray-600 border-gray-200",
};

// ─── Component ──────────────────────────────────────────────

export default function PartnerUsersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permissionsId, setPermissionsId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [filterPartnerId, setFilterPartnerId] = useState("all");
  const [filterRole, setFilterRole] = useState("all");

  // ── Queries ──
  const buildQuery = () => {
    const params = new URLSearchParams();
    if (filterPartnerId !== "all") params.set("partnerId", filterPartnerId);
    if (filterRole !== "all") params.set("role", filterRole);
    return params.toString();
  };

  const { data: usersData, isLoading } = useQuery<{ partnerUsers: PartnerUser[]; total: number }>({
    queryKey: ["partner-users", filterPartnerId, filterRole],
    queryFn: async () => apiFetch(`/api/partner-users?${buildQuery()}`),
  });

  const { data: partnersData } = useQuery<{ partners: Partner[] }>({
    queryKey: ["partners-list-compact"],
    queryFn: async () => apiFetch("/api/partners"),
  });

  // For permissions dialog
  const { data: permissionsData } = useQuery<{ permissions: PartnerPermission[] }>({
    queryKey: ["partner-permissions"],
    queryFn: async () => apiFetch("/api/partner-permissions"),
    enabled: !!permissionsId,
  });

  const { data: assignedData, isLoading: assignedLoading } = useQuery<{
    permissions: AssignedPermission[];
  }>({
    queryKey: ["partner-user-permissions", permissionsId],
    queryFn: async () => apiFetch(`/api/partner-users/${permissionsId}/permissions`),
    enabled: !!permissionsId,
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) =>
      apiFetch("/api/partner-users", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Partner user created");
      queryClient.invalidateQueries({ queryKey: ["partner-users"] });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create user"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<typeof emptyForm> }) =>
      apiFetch(`/api/partner-users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Partner user updated");
      queryClient.invalidateQueries({ queryKey: ["partner-users"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update user"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiFetch(`/api/partner-users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Partner user deleted");
      queryClient.invalidateQueries({ queryKey: ["partner-users"] });
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete user"),
  });

  const assignPermissionMutation = useMutation({
    mutationFn: async ({ userId, permissionId }: { userId: string; permissionId: string }) =>
      apiFetch(`/api/partner-users/${userId}/permissions`, {
        method: "POST",
        body: JSON.stringify({ partnerPermissionId: permissionId }),
      }),
    onSuccess: () => {
      toast.success("Permission assigned");
      queryClient.invalidateQueries({ queryKey: ["partner-user-permissions", permissionsId] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to assign permission"),
  });

  const revokePermissionMutation = useMutation({
    mutationFn: async ({ userId, permissionId }: { userId: string; permissionId: string }) =>
      apiFetch(
        `/api/partner-users/${userId}/permissions?partnerPermissionId=${permissionId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      toast.success("Permission revoked");
      queryClient.invalidateQueries({ queryKey: ["partner-user-permissions", permissionsId] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to revoke permission"),
  });

  // ── Handlers ──
  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (user: PartnerUser) => {
    setForm({
      email: user.email,
      password: "",
      name: user.name,
      phone: user.phone,
      role: user.role,
      partnerId: user.partnerId,
      status: user.status,
    });
    setEditingId(user.id);
    setDialogOpen(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.name.trim() || !form.partnerId) {
      toast.error("Email, name and partner are required");
      return;
    }
    if (!editingId && !form.password) {
      toast.error("Password is required for new users");
      return;
    }
    if (editingId) {
      const payload: Partial<typeof emptyForm> = {
        name: form.name,
        phone: form.phone,
        role: form.role,
        status: form.status,
      };
      if (form.password) payload.password = form.password;
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(form);
    }
  };

  const users = usersData?.partnerUsers || [];
  const partners = partnersData?.partners || [];

  // Filter by search (client-side since server doesn't take ?search=)
  const filtered = search
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          u.partner?.name?.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  const assignedPermissionIds = new Set(
    (assignedData?.permissions || []).map((a) => a.partnerPermissionId),
  );

  // Group permissions by category
  const groupedPermissions = (permissionsData?.permissions || []).reduce<
    Record<string, PartnerPermission[]>
  >((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  const activeUsers = users.filter((u) => u.status === "ACTIVE").length;
  const totalPermissions = permissionsData?.permissions?.length || 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partner Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage partner staff accounts and their permissions
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2" disabled={partners.length === 0}>
          <Plus className="h-4 w-4" />
          New User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
              <UserCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold tabular-nums">{users.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-green-100 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Active Users</p>
              <p className="text-2xl font-bold tabular-nums">{activeUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Permissions</p>
              <p className="text-2xl font-bold tabular-nums">{totalPermissions}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, partner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterPartnerId} onValueChange={setFilterPartnerId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by partner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {partners.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Partner Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No partner users found.</p>
              {partners.length === 0 && (
                <p className="text-xs mt-1">Create a partner first.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Permissions</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold uppercase">
                            {u.name.slice(0, 2)}
                          </div>
                          <div>
                            <div>{u.name}</div>
                            {u.phone && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {u.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {u.email}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {u.partner ? (
                          <span>{u.partner.name}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={ROLE_STYLES[u.role] || ROLE_STYLES.READONLY_USER}>
                          {u.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[u.status] || STATUS_STYLES.INACTIVE}>
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="tabular-nums">
                          {u.permissionCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString()
                          : "never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPermissionsId(u.id)}
                            aria-label="Manage permissions"
                            title="Manage permissions"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(u)}
                            aria-label="Edit user"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(u.id)}
                            aria-label="Delete user"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Partner User" : "Create Partner User"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update user details. Leave password blank to keep current."
                : "Create a new login for a partner staff member."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@example.com"
                disabled={!!editingId}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                Password {editingId && "(leave blank to keep current)"} *
              </Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min 6 characters"
                {...(!editingId && { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnerId">Partner *</Label>
              <Select
                value={form.partnerId}
                onValueChange={(v) => setForm({ ...form, partnerId: v })}
                disabled={!!editingId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a partner" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                {editingId ? "Save Changes" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permissionsId} onOpenChange={(o) => !o && setPermissionsId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Manage Permissions
            </DialogTitle>
            <DialogDescription>
              Toggle permissions assigned to this partner user.
            </DialogDescription>
          </DialogHeader>
          {assignedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
                    {category}
                  </h4>
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                    {perms.map((perm) => {
                      const assigned = assignedPermissionIds.has(perm.id);
                      const isPending =
                        assignPermissionMutation.isPending ||
                        revokePermissionMutation.isPending;
                      return (
                        <label
                          key={perm.id}
                          className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                            assigned
                              ? "bg-green-50 border-green-200"
                              : "bg-card hover:bg-muted/50 border-border"
                          }`}
                        >
                          <Checkbox
                            checked={assigned}
                            disabled={isPending}
                            onCheckedChange={(checked) => {
                              if (!permissionsId) return;
                              if (checked) {
                                assignPermissionMutation.mutate({
                                  userId: permissionsId,
                                  permissionId: perm.id,
                                });
                              } else {
                                revokePermissionMutation.mutate({
                                  userId: permissionsId,
                                  permissionId: perm.id,
                                });
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-mono font-medium">{perm.key}</div>
                            {perm.description && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {perm.description}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(groupedPermissions).length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No permissions defined yet.</p>
                  <p className="text-xs mt-1">
                    Run the seed or create permissions via the API.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Partner User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user account and revoke all assigned
              permissions. This action cannot be undone.
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
