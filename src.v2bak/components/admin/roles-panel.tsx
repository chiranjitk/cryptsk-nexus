"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  ShieldCheck,
  Users,
  Lock,
  Check,
  Plus,
  Trash2,
  Search,
  Loader2,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// Types
// ============================================================

type RoleDTO = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  isBreakGlass: boolean;
  sortOrder: number;
  createdAt: string;
  userCount: number;
  permissionCount: number;
  permissionIds: string[];
  permissions: Record<string, string[]>;
};

type PermissionItem = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
};

type PermissionGroup = {
  resource: string;
  permissions: PermissionItem[];
};

async function jsonError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

// ============================================================
// Roles Panel
// ============================================================

export function RolesPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editorRole, setEditorRole] = React.useState<RoleDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<RoleDTO | null>(null);

  const rolesQuery = useQuery<{ roles: RoleDTO[] }>({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await fetch("/api/roles");
      if (!res.ok) throw new Error(await jsonError(res, "Failed to load roles"));
      return res.json();
    },
  });

  const deleteRole = useMutation({
    mutationFn: async (roleId: string) => {
      const res = await fetch(`/api/roles/${roleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await jsonError(res, "Failed to delete role"));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast({ title: "Role deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Cannot delete role", description: err.message, variant: "destructive" });
    },
  });

  const roles = rolesQuery.data?.roles ?? [];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roles &amp; Permissions</h1>
          <p className="text-sm text-muted-foreground">
            {rolesQuery.isLoading
              ? "Loading…"
              : `${roles.length} roles · ${roles.reduce((n, r) => n + r.permissionCount, 0)} permission grants · RBAC matrix · per spec §08_SECURITY_RBAC`}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Create Role
        </Button>
      </div>

      {rolesQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rolesQuery.isError ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <div>
              <p className="font-medium">Failed to load roles</p>
              <p className="text-sm text-muted-foreground">
                {rolesQuery.error instanceof Error ? rolesQuery.error.message : "Unexpected error"}
              </p>
            </div>
            <Button variant="outline" onClick={() => rolesQuery.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Shield className="size-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">No roles yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first role to start building the RBAC matrix.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="size-4" />
              Create Role
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => {
            const canDelete = !role.isSystem && role.userCount === 0;
            const deleteHint = role.isSystem
              ? "System roles cannot be deleted"
              : role.userCount > 0
                ? `Remove the ${role.userCount} assigned user${role.userCount === 1 ? "" : "s"} before deleting`
                : "Delete this role";
            return (
              <Card key={role.id} className="cryptsk-card-load card-lift overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex size-10 items-center justify-center rounded-lg ${
                          role.isBreakGlass ? "bg-rose-500/10" : "bg-primary/10"
                        }`}
                      >
                        {role.isBreakGlass ? (
                          <Lock className="size-5 text-rose-500" />
                        ) : (
                          <Shield className="size-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-base flex flex-wrap items-center gap-2">
                          {role.name}
                          {role.isBreakGlass && (
                            <Badge variant="secondary" className="text-[9px] bg-rose-500/10 text-rose-600">
                              Break-glass
                            </Badge>
                          )}
                          {role.isSystem && (
                            <Badge variant="outline" className="text-[9px] gap-1">
                              <Lock className="size-2.5" />
                              System
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="font-mono text-xs">{role.slug}</CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Users className="size-3" />
                        {role.userCount} user{role.userCount === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Check className="size-3" />
                        {role.permissionCount} perm{role.permissionCount === 1 ? "" : "s"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        Created {formatDate(role.createdAt)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {role.description && (
                    <p className="text-xs text-muted-foreground mb-3">{role.description}</p>
                  )}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto cryptsk-scrollbar mb-3">
                    {Object.entries(role.permissions).map(([resource, actions]) => (
                      <div key={resource} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">{resource}</span>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {(actions as string[]).map((action) => (
                            <Badge
                              key={action}
                              variant="outline"
                              className="text-[9px] px-1 py-0 border-primary/20 text-primary/70"
                            >
                              {action}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                    {role.permissionCount === 0 && (
                      <p className="text-xs text-muted-foreground italic">No permissions assigned</p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setEditorRole(role)}
                    >
                      <ShieldCheck className="size-4 text-primary" />
                      Permissions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      disabled={!canDelete}
                      title={deleteHint}
                      onClick={() => setDeleteTarget(role)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["roles"] })}
      />

      {editorRole && (
        <PermissionEditorDialog
          key={editorRole.id}
          role={editorRole}
          open={!!editorRole}
          onOpenChange={(open) => {
            if (!open) setEditorRole(null);
          }}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the role and its {deleteTarget?.permissionCount ?? 0} permission
              grants. This action is recorded in the audit log and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRole.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteRole.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                deleteRole.mutate(deleteTarget.id, {
                  onSettled: () => setDeleteTarget(null),
                });
              }}
            >
              {deleteRole.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="size-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Create Role Dialog
// ============================================================

function CreateRoleDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
      setSlugTouched(false);
      setDescription("");
    }
  }, [open]);

  const createRole = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug || slugify(name),
          description: description || undefined,
        }),
      });
      if (!res.ok) throw new Error(await jsonError(res, "Failed to create role"));
      return res.json();
    },
    onSuccess: (data: { role: RoleDTO }) => {
      toast({
        title: "Role created",
        description: `${data.role.name} (${data.role.slug}) is ready — assign permissions next.`,
      });
      onCreated();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Cannot create role", description: err.message, variant: "destructive" });
    },
  });

  const slugValid = /^[a-z0-9_]*$/.test(slug) && slug.length > 0;
  const canSubmit = name.trim().length > 0 && slug.length > 0 && slugValid && !createRole.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            Create Role
          </DialogTitle>
          <DialogDescription>
            Custom roles are never system roles and can be deleted once no users are assigned.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              placeholder="e.g. Regional Manager"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-slug">Slug</Label>
            <Input
              id="role-slug"
              placeholder="regional_manager"
              value={slug}
              className={`font-mono ${slug && !slugValid ? "border-destructive" : ""}`}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
              }}
            />
            {slug && !slugValid && (
              <p className="text-xs text-destructive">
                Lowercase letters, numbers and underscores only.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Description (optional)</Label>
            <Textarea
              id="role-description"
              placeholder="What is this role responsible for?"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createRole.isPending}>
            Cancel
          </Button>
          <Button onClick={() => createRole.mutate()} disabled={!canSubmit} className="gap-2">
            {createRole.isPending && <Loader2 className="size-4 animate-spin" />}
            Create Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Permission Editor Dialog
// ============================================================

function PermissionEditorDialog({
  role,
  open,
  onOpenChange,
}: {
  role: RoleDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(role.permissionIds));
  const [filter, setFilter] = React.useState("");

  const permsQuery = useQuery<{ groups: PermissionGroup[]; total: number }>({
    queryKey: ["permissions"],
    queryFn: async () => {
      const res = await fetch("/api/permissions");
      if (!res.ok) throw new Error(await jsonError(res, "Failed to load permissions"));
      return res.json();
    },
    enabled: open,
    staleTime: Infinity,
  });

  const groups = permsQuery.data?.groups ?? [];
  const filteredGroups = filter
    ? groups.filter((g) => g.resource.toLowerCase().includes(filter.toLowerCase()))
    : groups;

  const original = React.useMemo(() => new Set(role.permissionIds), [role.permissionIds]);
  const added = [...selected].filter((id) => !original.has(id)).length;
  const removed = [...original].filter((id) => !selected.has(id)).length;
  const hasDiff = added > 0 || removed > 0;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: PermissionGroup) => {
    const ids = group.permissions.map((p) => p.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const savePerms = useMutation({
    mutationFn: async (permissionIds: string[]) => {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionIds }),
      });
      if (!res.ok) throw new Error(await jsonError(res, "Failed to save permissions"));
      return res.json();
    },
    // Optimistic update on the roles cache
    onMutate: async (permissionIds: string[]) => {
      await qc.cancelQueries({ queryKey: ["roles"] });
      const previous = qc.getQueryData<{ roles: RoleDTO[] }>(["roles"]);
      const allPerms = qc.getQueryData<{ groups: PermissionGroup[] }>(["permissions"]);
      qc.setQueryData<{ roles: RoleDTO[] }>(["roles"], (old) => {
        if (!old) return old;
        return {
          roles: old.roles.map((r) => {
            if (r.id !== role.id) return r;
            const grouped: Record<string, string[]> = {};
            if (allPerms) {
              for (const g of allPerms.groups) {
                for (const p of g.permissions) {
                  if (permissionIds.includes(p.id)) {
                    (grouped[p.resource] ??= []).push(p.action);
                  }
                }
              }
            }
            return {
              ...r,
              permissionIds,
              permissionCount: permissionIds.length,
              permissions: grouped,
            };
          }),
        };
      });
      return { previous };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["roles"], ctx.previous);
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
    onSuccess: () => {
      toast({
        title: `Permissions updated for ${role.name}`,
        description: `+${added} added · −${removed} removed`,
      });
      onOpenChange(false);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Permissions — {role.name}
          </DialogTitle>
          <DialogDescription>
            {role.isSystem
              ? "System role: name is locked, but the permission matrix can be edited (all changes are audited)."
              : "Toggle resource actions for this role. Changes are audited."}
            {selected.size > 0 && (
              <span className="block mt-1 text-xs font-medium text-foreground">
                {selected.size} of {permsQuery.data?.total ?? "…"} permissions selected
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter resources…"
            className="pl-8"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {permsQuery.isLoading ? (
          <div className="space-y-3 max-h-96 overflow-y-auto cryptsk-scrollbar">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <div className="flex gap-1.5">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <Skeleton key={j} className="h-6 w-14 rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : permsQuery.isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle className="size-6 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {permsQuery.error instanceof Error ? permsQuery.error.message : "Failed to load permissions"}
            </p>
            <Button variant="outline" size="sm" onClick={() => permsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No resources match “{filter}”.
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto cryptsk-scrollbar pr-1">
            {filteredGroups.map((group) => {
              const ids = group.permissions.map((p) => p.id);
              const selectedCount = ids.filter((id) => selected.has(id)).length;
              const allSelected = selectedCount === ids.length;
              return (
                <div key={group.resource} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="size-3.5 text-muted-foreground" />
                      <span className="font-mono text-sm font-medium">{group.resource}</span>
                      <Badge variant="outline" className="text-[9px] px-1">
                        {selectedCount}/{ids.length}
                      </Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-primary transition-colors"
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.permissions.map((p) => {
                      const isOn = selected.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="checkbox"
                          aria-checked={isOn}
                          aria-label={`${p.action} ${p.resource}`}
                          title={p.description || `${p.action} ${p.resource}`}
                          onClick={() => toggle(p.id)}
                          className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            isOn
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <Checkbox className="size-3 pointer-events-none" checked={isOn} tabIndex={-1} />
                          {p.action}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {hasDiff ? (
              <span>
                <span className="text-primary font-medium">+{added}</span> added ·{" "}
                <span className="text-destructive font-medium">−{removed}</span> removed
              </span>
            ) : (
              "No changes"
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={savePerms.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => savePerms.mutate(Array.from(selected))}
              disabled={!hasDiff || savePerms.isPending}
              className="gap-2"
            >
              {savePerms.isPending && <Loader2 className="size-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
