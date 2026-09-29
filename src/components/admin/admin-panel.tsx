"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Blocks,
  Check,
  CheckCircle2,
  Copy,
  FileJson,
  Flag,
  Hash,
  Info,
  KeyRound,
  Lock,
  MoreHorizontal,
  Plus,
  Power,
  RefreshCcw,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Wrench,
  XCircle,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// Administration — API Keys · System Settings · Modules ·
// Feature Flags · Notifications
// ============================================================

// ---------- helpers ----------

function rel(date: string | null | undefined): string {
  if (!date) return "Never";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "—";
  }
}

function fmtDate(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ---------- types ----------

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  status: "active" | "revoked" | "expired";
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type SettingRow = {
  id: string;
  key: string;
  value: string;
  type: "boolean" | "string" | "number" | "json";
  category: string;
  description: string | null;
  isSensitive: boolean;
  updatedAt: string;
};

type ModuleRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  status: "active" | "inactive" | "maintenance" | "error" | "not_installed";
  isRequired: boolean;
  sortOrder: number;
  installedAt: string | null;
  enabledAt: string | null;
  _count: { featureFlags: number };
};

type FlagRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: "boolean" | "string" | "number" | "json";
  value: string;
  isEnabled: boolean;
  isSystem: boolean;
  moduleSlug: string | null;
  updatedAt: string;
};

type NotificationRow = {
  id: string;
  type: "info" | "success" | "warning" | "error" | "system";
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  actionUrl: string | null;
  createdAt: string;
};

// ---------- status styling ----------

const API_KEY_STATUS: Record<ApiKeyRow["status"], { label: string; className: string }> = {
  active: { label: "Active", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  revoked: { label: "Revoked", className: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
  expired: { label: "Expired", className: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-400" },
};

const MODULE_STATUS: Record<ModuleRow["status"], { label: string; dot: string; className: string }> = {
  active: { label: "Active", dot: "bg-emerald-500", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  inactive: { label: "Inactive", dot: "bg-slate-400", className: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  maintenance: { label: "Maintenance", dot: "bg-amber-500", className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  error: { label: "Error", dot: "bg-red-500", className: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
  not_installed: { label: "Not Installed", dot: "bg-zinc-400", className: "border-zinc-400/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" },
};

const NOTIFICATION_STYLE: Record<
  NotificationRow["type"],
  { icon: React.ElementType; className: string }
> = {
  info: { icon: Info, className: "text-foreground/60" },
  success: { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  warning: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
  error: { icon: XCircle, className: "text-red-600 dark:text-red-400" },
  system: { icon: Server, className: "text-primary" },
};

const FLAG_TYPES = ["boolean", "string", "number", "json"] as const;

// ============================================================
// Tab 1 — API Keys
// ============================================================

function ApiKeysTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newExpiry, setNewExpiry] = React.useState("");
  const [created, setCreated] = React.useState<{ name: string; key: string; prefix: string } | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<ApiKeyRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ApiKeyRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => jsonFetch("/api/api-keys"),
  });

  const createKey = useMutation({
    mutationFn: (input: { name: string; expiresAt?: string }) =>
      jsonFetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: (result: { apiKey: ApiKeyRow; key: string; oneTimeView: boolean }) => {
      setCreated({ name: result.apiKey.name, key: result.key, prefix: result.apiKey.prefix });
      setConfirmed(false);
      setNewName("");
      setNewExpiry("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key created", description: "Copy the secret now — it is shown only once." });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to create API key", description: err.message, variant: "destructive" }),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) =>
      jsonFetch(`/api/api-keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked" }),
      }),
    onSuccess: () => {
      setRevokeTarget(null);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key revoked" });
    },
    onError: (err: Error) => {
      setRevokeTarget(null);
      toast({ title: "Failed to revoke key", description: err.message, variant: "destructive" });
    },
  });

  const deleteKey = useMutation({
    mutationFn: (id: string) => jsonFetch(`/api/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key deleted" });
    },
    onError: (err: Error) => {
      setDeleteTarget(null);
      toast({ title: "Failed to delete key", description: err.message, variant: "destructive" });
    },
  });

  const apiKeys: ApiKeyRow[] = data?.apiKeys || [];

  const copyKey = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Select and copy the key manually.", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">API Keys</CardTitle>
            <CardDescription>
              Service credentials for external integrations. Secrets are hashed (SHA-256) and never shown again after creation.
            </CardDescription>
          </div>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Create API Key
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <KeyRound className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No API keys yet</p>
              <p className="text-xs text-muted-foreground">Create a key to allow trusted services to call the Nexus API.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key Prefix</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((k) => (
                    <TableRow key={k.id} className="hover:bg-muted/50">
                      <TableCell className="text-sm font-medium">{k.name}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{k.keyPrefix}…</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={API_KEY_STATUS[k.status].className}>
                          {API_KEY_STATUS[k.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{rel(k.lastUsedAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(k.expiresAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(k.createdAt)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${k.name}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={k.status !== "active"}
                              onClick={() => setRevokeTarget(k)}
                              className="text-amber-600 focus:text-amber-600"
                            >
                              <XCircle className="mr-2 size-4" /> Revoke
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(k)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 size-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / one-time secret dialog */}
      <Dialog
        open={createOpen || !!created}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setCreated(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-primary" /> One-time secret
                </DialogTitle>
                <DialogDescription>
                  This is the full key for <span className="font-medium text-foreground">{created.name}</span>. You won&apos;t see this again — store it now.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Copy and store this secret in a safe place. It is hashed on the server and
                    <span className="font-semibold"> cannot be retrieved again</span>.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="cryptsk-scrollbar min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted p-3 font-mono text-xs">
                  {created.key}
                </code>
                <Button variant="outline" size="icon" className="size-9 shrink-0" onClick={copyKey} aria-label="Copy key">
                  <Copy className="size-4" />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
                I have stored this key safely and understand it will not be shown again.
              </label>
              <DialogFooter>
                <Button disabled={!confirmed} onClick={() => setCreated(null)}>
                  <Check className="mr-1 size-4" /> Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Generate a <code className="font-mono text-xs">csk_live_…</code> key for a trusted service or integration.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key-name">Name</Label>
                  <Input
                    id="api-key-name"
                    placeholder="e.g. billing-sync-service"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-key-expiry">Expiry (optional)</Label>
                  <Input
                    id="api-key-expiry"
                    type="date"
                    value={newExpiry}
                    onChange={(e) => setNewExpiry(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={!newName.trim() || createKey.isPending}
                  onClick={() => createKey.mutate({ name: newName.trim(), expiresAt: newExpiry || undefined })}
                >
                  {createKey.isPending ? "Generating…" : "Generate Key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revokeTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Services using this key will immediately lose access. Revocation is permanent — a new key must be issued.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => revokeTarget && revokeKey.mutate(revokeTarget.id)}
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the key record from the registry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => deleteTarget && deleteKey.mutate(deleteTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Tab 2 — System Settings
// ============================================================

function SettingField({
  setting,
  onSave,
}: {
  setting: SettingRow;
  onSave: (key: string, value: string) => void;
}) {
  const [draft, setDraft] = React.useState(setting.value);
  const dirty = draft !== setting.value;

  if (setting.type === "boolean") {
    return (
      <Switch
        checked={setting.value === "true"}
        onCheckedChange={(v) => onSave(setting.key, v ? "true" : "false")}
        aria-label={setting.key}
      />
    );
  }

  return (
    <Input
      type={setting.isSensitive ? "password" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => dirty && onSave(setting.key, draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`h-8 w-44 font-mono text-xs md:w-56 ${dirty ? "border-primary" : ""}`}
      aria-label={setting.key}
    />
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => jsonFetch("/api/settings"),
  });

  const saveSetting = useMutation({
    mutationFn: (input: { key: string; value: string }) =>
      jsonFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Setting saved" });
    },
    onError: (err: Error) => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Failed to save setting", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  const grouped: Record<string, SettingRow[]> = data?.grouped || {};
  const categories = Object.keys(grouped);

  if (categories.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Settings2 className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No settings configured</p>
          <p className="text-xs text-muted-foreground">System settings appear here grouped by category.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      {categories.map((category) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base capitalize">{category}</CardTitle>
            <CardDescription className="text-xs">
              {grouped[category].length} setting{grouped[category].length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="cryptsk-scrollbar max-h-96 space-y-1 overflow-y-auto">
            {grouped[category].map((setting) => (
              <div
                key={setting.id}
                className="flex flex-col gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <code className="font-mono text-xs font-medium">{setting.key}</code>
                  {setting.description && (
                    <p className="truncate text-xs text-muted-foreground" title={setting.description}>
                      {setting.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 pl-6 sm:pl-0">
                  <SettingField setting={setting} onSave={(key, value) => saveSetting.mutate({ key, value })} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// Tab 3 — Modules
// ============================================================

function ModulesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["modules"],
    queryFn: () => jsonFetch("/api/modules"),
  });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: ModuleRow["status"] }) =>
      jsonFetch(`/api/modules/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["modules"] });
      toast({ title: "Module status updated" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to update module", description: err.message, variant: "destructive" }),
  });

  const modules: ModuleRow[] = data?.modules || [];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Blocks className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No modules registered</p>
          <p className="text-xs text-muted-foreground">Installed platform modules will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {modules.map((m) => {
        const st = MODULE_STATUS[m.status];
        return (
          <Card key={m.id} className="cryptsk-card-load">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-1.5 text-base">
                    <span className="truncate">{m.name}</span>
                    {m.isRequired && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Core module" />
                        </TooltipTrigger>
                        <TooltipContent>Core module — cannot be deactivated</TooltipContent>
                      </Tooltip>
                    )}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">
                    {m.description || m.slug}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={`${st.className} shrink-0`}>
                  <span className={`mr-1.5 size-2 rounded-full ${st.dot}`} />
                  {st.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">v{m.version}</span>
                <span>sort {m.sortOrder}</span>
                <span>{m._count.featureFlags} flag{m._count.featureFlags === 1 ? "" : "s"}</span>
                <span>{m.enabledAt ? `enabled ${rel(m.enabledAt)}` : "never enabled"}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Wrench className="size-3.5" /> Manage Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs">Set status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={m.status === "active"}
                    onClick={() => setStatus.mutate({ id: m.id, status: "active" })}
                  >
                    <Power className="mr-2 size-4 text-emerald-600" /> Activate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={m.status === "maintenance"}
                    onClick={() => setStatus.mutate({ id: m.id, status: "maintenance" })}
                  >
                    <Wrench className="mr-2 size-4 text-amber-600" /> Maintenance
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={m.status === "inactive" || m.isRequired}
                    onClick={() => setStatus.mutate({ id: m.id, status: "inactive" })}
                  >
                    <XCircle className="mr-2 size-4 text-red-600" />
                    Deactivate
                    {m.isRequired && <Lock className="ml-auto size-3 text-muted-foreground" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
// Tab 4 — Feature Flags
// ============================================================

function flagPreview(flag: FlagRow): string {
  if (flag.type === "boolean") return flag.value === "true" ? "true" : "false";
  return flag.value.length > 28 ? `${flag.value.slice(0, 28)}…` : flag.value;
}

const FLAG_TYPE_ICON: Record<FlagRow["type"], React.ElementType> = {
  boolean: Power,
  string: Hash,
  number: Hash,
  json: FileJson,
};

function NewFlagDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [key, setKey] = React.useState("");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<FlagRow["type"]>("boolean");
  const [boolValue, setBoolValue] = React.useState(false);
  const [textValue, setTextValue] = React.useState("");
  const [enabled, setEnabled] = React.useState(false);
  const [description, setDescription] = React.useState("");

  const reset = () => {
    setKey("");
    setName("");
    setType("boolean");
    setBoolValue(false);
    setTextValue("");
    setEnabled(false);
    setDescription("");
  };

  const createFlag = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      jsonFetch("/api/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      toast({ title: "Feature flag created" });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to create flag", description: err.message, variant: "destructive" }),
  });

  const submit = () => {
    let value: unknown;
    if (type === "boolean") value = boolValue;
    else if (type === "number") value = textValue;
    else value = textValue;
    createFlag.mutate({ key: key.trim(), name: name.trim(), type, value, enabled, description: description || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Feature Flag</DialogTitle>
          <DialogDescription>Gate features per environment with typed runtime flags.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="flag-key">Key</Label>
              <Input id="flag-key" placeholder="billing.auto_retry" className="font-mono text-xs" value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flag-name">Name</Label>
              <Input id="flag-name" placeholder="Auto Payment Retry" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FlagRow["type"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLAG_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="font-mono text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="flag-value">{type === "boolean" ? "Default value" : "Value"}</Label>
              <p className="text-xs text-muted-foreground">
                {type === "boolean" ? "Whether the flag starts as true" : type === "json" ? "Must be valid JSON" : type === "number" ? "Must be a number" : "Free-form string"}
              </p>
            </div>
            {type === "boolean" ? (
              <Switch id="flag-value" checked={boolValue} onCheckedChange={setBoolValue} />
            ) : type === "json" ? (
              <Textarea
                id="flag-value"
                placeholder='{"retries": 3}'
                className="h-16 w-52 font-mono text-xs"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
              />
            ) : (
              <Input
                id="flag-value"
                type={type === "number" ? "number" : "text"}
                className="w-52 font-mono text-xs"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
              />
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="flag-enabled">Enable immediately</Label>
              <p className="text-xs text-muted-foreground">Flags start disabled unless enabled here</p>
            </div>
            <Switch id="flag-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flag-desc">Description (optional)</Label>
            <Input id="flag-desc" placeholder="What does this flag control?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!key.trim() || !name.trim() || createFlag.isPending} onClick={submit}>
            {createFlag.isPending ? "Creating…" : "Create Flag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeatureFlagsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newOpen, setNewOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<FlagRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => jsonFetch("/api/feature-flags"),
  });

  const toggleFlag = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      jsonFetch(`/api/feature-flags/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: input.enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      toast({ title: "Flag updated" });
    },
    onError: (err: Error) => {
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      toast({ title: "Failed to update flag", description: err.message, variant: "destructive" });
    },
  });

  const deleteFlag = useMutation({
    mutationFn: (id: string) => jsonFetch(`/api/feature-flags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      toast({ title: "Flag deleted" });
    },
    onError: (err: Error) => {
      setDeleteTarget(null);
      toast({ title: "Failed to delete flag", description: err.message, variant: "destructive" });
    },
  });

  const flags: FlagRow[] = data?.flags || [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Feature Flags</CardTitle>
            <CardDescription>Typed runtime toggles — boolean, string, number and JSON values.</CardDescription>
          </div>
          <Button className="gap-2" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> New Flag
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : flags.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Flag className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No feature flags</p>
              <p className="text-xs text-muted-foreground">Create a flag to control features at runtime.</p>
            </div>
          ) : (
            <div className="cryptsk-scrollbar max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flags.map((flag) => {
                    const TypeIcon = FLAG_TYPE_ICON[flag.type];
                    return (
                      <TableRow key={flag.id} className="hover:bg-muted/50">
                        <TableCell>
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{flag.key}</code>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{flag.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                            <TypeIcon className="size-3" /> {flag.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={flag.isEnabled}
                            onCheckedChange={(v) => toggleFlag.mutate({ id: flag.id, enabled: v })}
                            aria-label={`Toggle ${flag.key}`}
                          />
                        </TableCell>
                        <TableCell>
                          <code className="font-mono text-xs text-muted-foreground">{flagPreview(flag)}</code>
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={flag.description || undefined}>
                          {flag.description || "—"}
                        </TableCell>
                        <TableCell>
                          {flag.isSystem ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Lock className="size-3.5 text-muted-foreground" aria-label="System flag" />
                              </TooltipTrigger>
                              <TooltipContent>System flag — cannot be deleted</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-red-600 hover:text-red-700"
                              onClick={() => setDeleteTarget(flag)}
                              aria-label={`Delete ${flag.key}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewFlagDialog open={newOpen} onOpenChange={setNewOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete flag “{deleteTarget?.key}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Code checking this flag will fall back to its default behavior. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => deleteTarget && deleteFlag.mutate(deleteTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Tab 5 — Notifications
// ============================================================

const NOTIFICATION_FILTERS = ["all", "info", "success", "warning", "error", "system"] as const;

function NotificationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<(typeof NOTIFICATION_FILTERS)[number]>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () =>
      jsonFetch(`/api/notifications?limit=50${filter !== "all" ? `&type=${filter}` : ""}`),
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      jsonFetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (err: Error) =>
      toast({ title: "Failed to mark as read", description: err.message, variant: "destructive" }),
  });

  const markAllRead = useMutation({
    mutationFn: () => jsonFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: (result: { updated: number }) => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: `Marked ${result.updated} notification${result.updated === 1 ? "" : "s"} as read` });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to mark all read", description: err.message, variant: "destructive" }),
  });

  const notifications: NotificationRow[] = data?.notifications || [];
  const unreadCount: number = data?.unreadCount ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-primary text-primary-foreground">{unreadCount}</Badge>
            )}
          </CardTitle>
          <CardDescription>Your in-app notifications — click an unread item to mark it read.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={unreadCount === 0 || markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          <RefreshCcw className="size-3.5" /> Mark all read
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount}</Badge>}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {NOTIFICATION_FILTERS.map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              className="h-7 rounded-full px-3 text-xs capitalize"
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BellOff className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs text-muted-foreground">
              {filter === "all" ? "You're all caught up." : `No ${filter} notifications.`}
            </p>
          </div>
        ) : (
          <div className="cryptsk-scrollbar max-h-96 space-y-1 overflow-y-auto" role="list">
            {notifications.map((n) => {
              const style = NOTIFICATION_STYLE[n.type];
              const Icon = style.icon;
              return (
                <button
                  key={n.id}
                  type="button"
                  role="listitem"
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    n.readAt ? "opacity-70 hover:bg-muted/40" : "border-primary/20 bg-primary/[0.04] hover:bg-muted/60"
                  }`}
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${style.className}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      <span className={`truncate text-sm ${n.readAt ? "font-normal" : "font-semibold"}`}>{n.title}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{rel(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                    {n.actionUrl && (
                      <span className="mt-1 inline-block font-mono text-[11px] text-primary/80">{n.actionUrl}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Administration Panel
// ============================================================

export function AdminPanel() {
  const tabs = [
    { value: "api-keys", label: "API Keys", icon: KeyRound },
    { value: "settings", label: "System Settings", icon: Settings2 },
    { value: "modules", label: "Modules", icon: Blocks },
    { value: "feature-flags", label: "Feature Flags", icon: Flag },
    { value: "notifications", label: "Notifications", icon: Bell },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <Tabs defaultValue="api-keys" className="gap-4">
        <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <ShieldCheck className="size-6 text-primary" /> Administration
              </h1>
              <p className="text-sm text-muted-foreground">
                Platform credentials, configuration, modules and runtime flags
              </p>
            </div>
          </div>
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 px-3">
                <tab.icon className="size-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="api-keys" className="mt-0">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-0">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="modules" className="mt-0">
          <ModulesTab />
        </TabsContent>
        <TabsContent value="feature-flags" className="mt-0">
          <FeatureFlagsTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-0">
          <NotificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
