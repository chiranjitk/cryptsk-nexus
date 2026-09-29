"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key, Plus, Trash2, Loader2, Copy, Check, Eye, EyeOff, Shield, ExternalLink,
  Pencil, RefreshCw, BarChart3, Clock, CalendarClock, Timer, Hourglass,
  HelpCircle, Webhook, Gauge, AlertTriangle, ChevronRight, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

interface ApiKeyItem {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  lastUsedAt: string | null;
  lastUsedUserAgent: string;
  requestCount: number;
  requestsPerMinute: number;
  requestsPerDay: number;
  autoExpiryDays: number;
  expiresAt: string | null;
  status: string;
  createdAt: string;
  ipWhitelist?: string | null;
}

const SCOPE_OPTIONS = ["read", "write", "admin", "subscribers", "plans", "invoices", "payments"];

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  read: "Read-only access to data",
  write: "Create and update data",
  admin: "Full administrative access",
  subscribers: "Manage subscribers",
  plans: "Manage internet plans",
  invoices: "Create and manage invoices",
  payments: "Process and verify payments",
};

// ─── Helpers ─────────────────────────────────────────────────

function getExpiryInfo(expiresAt: string | null, autoExpiryDays: number, createdAt: string) {
  if (!expiresAt && autoExpiryDays <= 0) return null;
  const effectiveExpiry = expiresAt
    ? new Date(expiresAt)
    : autoExpiryDays > 0
      ? new Date(new Date(createdAt).getTime() + autoExpiryDays * 24 * 60 * 60 * 1000)
      : null;
  if (!effectiveExpiry) return null;
  const now = new Date();
  const diffMs = effectiveExpiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return { date: effectiveExpiry, daysLeft: diffDays, isExpired: diffDays < 0 };
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function getUsagePercent(requestCount: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((requestCount / limit) * 100));
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: "", scopes: ["read"] as string[], expiresAt: "", ipWhitelist: "", autoExpiryDays: 0, requestsPerMinute: 60, requestsPerDay: 1000 });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", ipWhitelist: "", requestsPerMinute: 60, requestsPerDay: 1000 });
  const [editId, setEditId] = useState<string | null>(null);
  const [regenerateId, setRegenerateId] = useState<string | null>(null);
  const [usageDetailId, setUsageDetailId] = useState<ApiKeyItem | null>(null);
  const [extendId, setExtendId] = useState<string | null>(null);

  // Scope editing dialog state
  const [scopeEditDialogOpen, setScopeEditDialogOpen] = useState(false);
  const [scopeEditId, setScopeEditId] = useState<string | null>(null);
  const [scopeEditScopes, setScopeEditScopes] = useState<string[]>([]);

  // Webhook help dialog
  const [webhookHelpOpen, setWebhookHelpOpen] = useState(false);

  const { data: keys, isLoading } = useQuery<ApiKeyItem[]>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const data = await apiFetch("/api/api-keys");
      const items = data.items || data;
      if (Array.isArray(items)) {
        return items.map((k: any) => ({
          ...k,
          scopes: typeof k.scopes === "string" ? JSON.parse(k.scopes) : k.scopes,
        }));
      }
      return items;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: typeof form) => {
      const res = await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("API key created! Copy it now - it won't be shown again.");
      setCreateDialogOpen(false);
      setForm({ name: "", scopes: ["read"], expiresAt: "", ipWhitelist: "", autoExpiryDays: 0, requestsPerMinute: 60, requestsPerDay: 1000 });
      if (data.key) { navigator.clipboard.writeText(data.key); setCopiedKey(data.key); setTimeout(() => setCopiedKey(null), 3000); }
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: () => toast.error("Failed to create API key"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast.success("API key revoked"); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["api-keys"] }); },
    onError: () => toast.error("Failed to revoke API key"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name: string; ipWhitelist: string; requestsPerMinute?: number; requestsPerDay?: number }) => {
      const res = await fetch(`/api/api-keys/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      toast.success("API key updated");
      setEditDialogOpen(false);
      setEditId(null);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: () => toast.error("Failed to update API key"),
  });

  const scopeUpdateMutation = useMutation({
    mutationFn: async ({ id, scopes }: { id: string; scopes: string[] }) => {
      const res = await fetch(`/api/api-keys/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scopes }) });
      if (!res.ok) throw new Error("Failed to update scopes");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Scopes updated successfully");
      setScopeEditDialogOpen(false);
      setScopeEditId(null);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: () => toast.error("Failed to update scopes"),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/api-keys/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "regenerate" }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("API key regenerated! Copy the new key now.");
      if (data.key) { navigator.clipboard.writeText(data.key); setCopiedKey(data.key); setTimeout(() => setCopiedKey(null), 3000); }
      setRegenerateId(null);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: () => toast.error("Failed to regenerate API key"),
  });

  const extendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/api-keys/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "extend" }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Key extended. New expiry: ${new Date(data.expiresAt).toLocaleDateString("en-IN")}`);
      setExtendId(null);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: () => toast.error("Failed to extend API key"),
  });

  const toggleScope = (scope: string, target: "create" | "edit" | "scope-edit") => {
    if (target === "create") {
      setForm(prev => ({ ...prev, scopes: prev.scopes.includes(scope) ? prev.scopes.filter(s => s !== scope) : [...prev.scopes, scope] }));
    } else if (target === "scope-edit") {
      setScopeEditScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
    }
  };

  const maskKey = (key: string) => key.slice(0, 8) + "..." + key.slice(-4);
  const copyKey = (key: string) => { navigator.clipboard.writeText(key); setCopiedKey(key); toast.success("Key copied to clipboard!"); setTimeout(() => setCopiedKey(null), 2000); };
  const toggleVisibility = (id: string) => { setVisibleKeys(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };

  const openEdit = (k: ApiKeyItem) => {
    setEditId(k.id);
    setEditForm({ name: k.name, ipWhitelist: k.ipWhitelist || "", requestsPerMinute: k.requestsPerMinute || 60, requestsPerDay: k.requestsPerDay || 1000 });
    setEditDialogOpen(true);
  };

  const openScopeEdit = (k: ApiKeyItem) => {
    setScopeEditId(k.id);
    setScopeEditScopes([...k.scopes]);
    setScopeEditDialogOpen(true);
  };

  // Usage data for charts
  const usageChartData = keys && keys.length > 0 ? keys.map(k => ({
    name: k.name.length > 10 ? k.name.slice(0, 10) + "…" : k.name,
    requests: k.requestCount || 0,
    dailyLimit: k.requestsPerDay || 1000,
  })) : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage API keys for integrations and external access.</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Create API Key
        </Button>
      </div>

      {/* Info Card */}
      <div className="rounded-xl border-2 border-teal-500/30 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-2 rounded-lg bg-teal-600 text-white"><Shield className="h-4 w-4" /></div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-teal-800 dark:text-teal-300 mb-1">API Documentation</h3>
            <p className="text-sm text-teal-700/80 dark:text-teal-300/80 leading-relaxed">
              Use API keys to authenticate with the Cryptsk API. Include the key in the <code className="bg-teal-100 dark:bg-teal-900 px-1 rounded text-xs">Authorization: Bearer &lt;key&gt;</code> header.
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button variant="outline" size="sm" className="text-xs gap-1 h-7 mt-2" onClick={() => window.open("/api/api-keys", "_blank")}>
                      <ExternalLink className="h-3 w-3" /> API Docs
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>View API documentation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Usage Analytics Summary */}
      {keys && keys.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Key className="h-5 w-5 text-teal-600 mx-auto mb-1" /><p className="text-2xl font-bold">{keys.length}</p><p className="text-xs text-muted-foreground">Total Keys</p></CardContent></Card>
          <Card className="border shadow-sm"><CardContent className="p-4 text-center"><BarChart3 className="h-5 w-5 text-emerald-600 mx-auto mb-1" /><p className="text-2xl font-bold">{keys.reduce((s, k) => s + (k.requestCount || 0), 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Requests</p></CardContent></Card>
          <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Shield className="h-5 w-5 text-green-600 mx-auto mb-1" /><p className="text-2xl font-bold text-green-600">{keys.filter(k => k.status === "active").length}</p><p className="text-xs text-muted-foreground">Active Keys</p></CardContent></Card>
          <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Hourglass className="h-5 w-5 text-amber-600 mx-auto mb-1" /><p className="text-2xl font-bold text-amber-600">{keys.filter(k => { const e = getExpiryInfo(k.expiresAt, k.autoExpiryDays, k.createdAt); return e && e.daysLeft <= 30 && !e.isExpired; }).length}</p><p className="text-xs text-muted-foreground">Expiring Soon</p></CardContent></Card>
        </div>
      )}

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Key className="h-4 w-4 text-red-600" />
            API Keys ({keys?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Key</TableHead>
                    <TableHead className="text-xs">Scopes</TableHead>
                    <TableHead className="text-xs">Rate Limit</TableHead>
                    <TableHead className="text-xs">Requests</TableHead>
                    <TableHead className="text-xs">Last Used</TableHead>
                    <TableHead className="text-xs">Expires</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!keys || keys.length === 0) ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">No API keys yet. Create one to get started.</TableCell></TableRow>
                  ) : (
                    keys.map((k) => {
                      const expiryInfo = getExpiryInfo(k.expiresAt, k.autoExpiryDays, k.createdAt);
                      const dailyUsagePercent = getUsagePercent(k.requestCount || 0, k.requestsPerDay || 1000);
                      return (
                        <TableRow key={k.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{k.name}</span>
                              {/* Webhook Config Help Icon */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setWebhookHelpOpen(true)}>
                                      <HelpCircle className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Webhook config guide</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            {expiryInfo && (
                              <Badge variant="outline" className={`text-[10px] w-fit mt-1 ${
                                expiryInfo.isExpired
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : expiryInfo.daysLeft <= 7
                                    ? "bg-red-100 text-red-700 border-red-200"
                                    : expiryInfo.daysLeft <= 30
                                      ? "bg-amber-100 text-amber-700 border-amber-200"
                                      : "bg-green-100 text-green-700 border-green-200"
                              }`}>
                                <Timer className="h-2.5 w-2.5 mr-0.5" />
                                {expiryInfo.isExpired
                                  ? "Expired"
                                  : expiryInfo.daysLeft <= 30
                                    ? `Expires in ${expiryInfo.daysLeft}d`
                                    : `Valid ${expiryInfo.daysLeft}d`}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{visibleKeys.has(k.id) ? k.key : maskKey(k.key)}</code>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleVisibility(k.id)}>{visibleKeys.has(k.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyKey(k.key)}>{copiedKey === k.key ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}</Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {k.scopes.slice(0, 3).map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
                              {k.scopes.length > 3 && <Badge variant="outline" className="text-[10px]">+{k.scopes.length - 3}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-[10px] text-muted-foreground">{k.requestsPerMinute || 60}/min · {k.requestsPerDay || 1000}/day</p>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${getUsageColor(dailyUsagePercent)}`} style={{ width: `${dailyUsagePercent}%` }} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            <span className="cursor-pointer hover:underline" onClick={() => setUsageDetailId(k)}>{(k.requestCount || 0).toLocaleString()}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(k.lastUsedAt)}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {k.expiresAt
                              ? new Date(k.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                              : expiryInfo
                                ? new Date(expiryInfo.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                : "Never"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => extendMutation.mutate(k.id)} title="Extend by 90 days">
                                      {extendMutation.isPending && extendMutation.variables === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Extend expiry by 90 days</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openScopeEdit(k)} title="Edit Scopes">
                                      <Shield className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit scopes</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(k)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => setRegenerateId(k.id)} title="Regenerate"><RefreshCw className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteId(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Chart */}
      {keys && keys.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Gauge className="h-4 w-4" />Request Volume by Key</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RTooltip />
                  <Bar dataKey="requests" fill="#8B5CF6" name="Requests" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4 text-red-600" />Create API Key</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Key Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Integration Key" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Scopes *</Label>
              <div className="space-y-1">
                {SCOPE_OPTIONS.map(scope => (
                  <label key={scope} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded">
                    <Checkbox checked={form.scopes.includes(scope)} onCheckedChange={() => toggleScope(scope, "create")} />
                    <span className="font-medium w-24">{scope}</span>
                    <span className="text-muted-foreground">{SCOPE_DESCRIPTIONS[scope]}</span>
                  </label>
                ))}
              </div>
            </div>
            {/* Rate Limiting */}
            <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
              <Label className="text-xs font-medium flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Rate Limiting</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px]">Requests / Minute</Label>
                  <Input type="number" value={form.requestsPerMinute} onChange={(e) => setForm({ ...form, requestsPerMinute: Number(e.target.value) || 60 })} min={1} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Requests / Day</Label>
                  <Input type="number" value={form.requestsPerDay} onChange={(e) => setForm({ ...form, requestsPerDay: Number(e.target.value) || 1000 })} min={1} className="h-8 text-xs" />
                </div>
              </div>
            </div>
            {/* Rotation Policy */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> Auto-Expiry (Rotation Policy)</Label>
              <Select value={form.autoExpiryDays === 0 ? "0" : String(form.autoExpiryDays)} onValueChange={(v) => setForm({ ...form, autoExpiryDays: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Never</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
              {form.autoExpiryDays > 0 && (
                <p className="text-[10px] text-muted-foreground">Key will automatically expire {form.autoExpiryDays} days after creation. Use the extend action to renew.</p>
              )}
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Expires At (optional, overrides auto-expiry)</Label><Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">IP Whitelist (optional, comma-separated)</Label><Input value={form.ipWhitelist} onChange={(e) => setForm({ ...form, ipWhitelist: e.target.value })} placeholder="e.g. 192.168.1.1, 10.0.0.1" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createMutation.isPending || !form.name || form.scopes.length === 0} onClick={() => createMutation.mutate(form)}>
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Creating...</> : "Create Key"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Pencil className="h-4 w-4 text-red-600" />Edit API Key</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Key Name *</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
              <Label className="text-xs font-medium flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Rate Limiting</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px]">Requests / Minute</Label>
                  <Input type="number" value={editForm.requestsPerMinute} onChange={(e) => setEditForm({ ...editForm, requestsPerMinute: Number(e.target.value) || 60 })} min={1} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Requests / Day</Label>
                  <Input type="number" value={editForm.requestsPerDay} onChange={(e) => setEditForm({ ...editForm, requestsPerDay: Number(e.target.value) || 1000 })} min={1} className="h-8 text-xs" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">IP Whitelist (comma-separated)</Label><Input value={editForm.ipWhitelist} onChange={(e) => setEditForm({ ...editForm, ipWhitelist: e.target.value })} placeholder="e.g. 192.168.1.1, 10.0.0.1" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={updateMutation.isPending || !editForm.name} onClick={() => editId && updateMutation.mutate({ id: editId, ...editForm })}>
                {updateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Updating...</> : "Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scope Edit Dialog */}
      <Dialog open={scopeEditDialogOpen} onOpenChange={setScopeEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-red-600" />Edit Scopes</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              {SCOPE_OPTIONS.map(scope => (
                <label key={scope} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1.5 rounded border mb-1" style={scopeEditScopes.includes(scope) ? { borderColor: "#DC2626", backgroundColor: "#FEF2F2" } : {}}>
                  <Checkbox checked={scopeEditScopes.includes(scope)} onCheckedChange={() => toggleScope(scope, "scope-edit")} />
                  <span className="font-medium w-24">{scope}</span>
                  <span className="text-muted-foreground">{SCOPE_DESCRIPTIONS[scope]}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">⚠️ Changing scopes may affect integrations using this key.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScopeEditDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={scopeEditScopes.length === 0 || scopeUpdateMutation.isPending} onClick={() => scopeEditId && scopeUpdateMutation.mutate({ id: scopeEditId, scopes: scopeEditScopes })}>
                {scopeUpdateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : "Save Scopes"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Regenerate Confirmation */}
      <AlertDialog open={!!regenerateId} onOpenChange={() => setRegenerateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Regenerate API Key</AlertDialogTitle><AlertDialogDescription>Are you sure? The current key will be immediately invalidated. Any services using it will lose access. A new key will be generated.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-orange-600 hover:bg-orange-700" disabled={regenerateMutation.isPending} onClick={() => regenerateId && regenerateMutation.mutate(regenerateId)}>{regenerateMutation.isPending ? "Regenerating..." : "Regenerate Key"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Extend Confirmation */}
      <AlertDialog open={!!extendId} onOpenChange={() => setExtendId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Extend API Key Expiry</AlertDialogTitle><AlertDialogDescription>Extend this key&apos;s expiry by 90 days from now?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={extendMutation.isPending} onClick={() => extendId && extendMutation.mutate(extendId)}>{extendMutation.isPending ? "Extending..." : "Extend 90 Days"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Usage Analytics Dialog */}
      <Dialog open={!!usageDetailId} onOpenChange={() => setUsageDetailId(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-red-600" />Usage Analytics</DialogTitle></DialogHeader>
          {usageDetailId && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Key Name</p><p className="text-sm font-semibold">{usageDetailId.name}</p></div>
                <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={`text-xs ${usageDetailId.status === "active" ? "bg-green-100 text-green-700 border-green-200" : ""}`}>{usageDetailId.status}</Badge></div>
                <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Total Requests</p><p className="text-lg font-bold">{(usageDetailId.requestCount || 0).toLocaleString()}</p></div>
                <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Last Used</p><p className="text-sm">{formatRelativeTime(usageDetailId.lastUsedAt)}</p></div>
                <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Rate Limit (Min)</p><p className="text-sm font-semibold">{usageDetailId.requestsPerMinute || 60}/min</p></div>
                <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Rate Limit (Day)</p><p className="text-sm font-semibold">{usageDetailId.requestsPerDay || 1000}/day</p></div>
                <div className="p-3 rounded-lg bg-muted/50 col-span-2"><p className="text-xs text-muted-foreground">Daily Usage</p>
                  <div className="mt-1.5">
                    <div className="flex justify-between text-[10px] mb-1"><span>{usageDetailId.requestCount || 0} / {usageDetailId.requestsPerDay || 1000}</span><span>{getUsagePercent(usageDetailId.requestCount || 0, usageDetailId.requestsPerDay || 1000)}%</span></div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${getUsageColor(getUsagePercent(usageDetailId.requestCount || 0, usageDetailId.requestsPerDay || 1000))}`} style={{ width: `${getUsagePercent(usageDetailId.requestCount || 0, usageDetailId.requestsPerDay || 1000)}%` }} /></div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Created</p><p className="text-sm">{new Date(usageDetailId.createdAt).toLocaleString("en-IN")}</p></div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Expires</p>
                  {(() => {
                    const exp = getExpiryInfo(usageDetailId.expiresAt, usageDetailId.autoExpiryDays, usageDetailId.createdAt);
                    return exp ? (
                      <div className="flex items-center gap-2">
                        <p className="text-sm">{new Date(exp.date).toLocaleDateString("en-IN")}</p>
                        <Badge variant="outline" className={`text-[10px] ${exp.isExpired ? "bg-red-100 text-red-700 border-red-200" : exp.daysLeft <= 30 ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-green-100 text-green-700 border-green-200"}`}>
                          {exp.isExpired ? "Expired" : `${exp.daysLeft}d left`}
                        </Badge>
                      </div>
                    ) : <p className="text-sm">Never</p>;
                  })()}
                </div>
              </div>
              {usageDetailId.ipWhitelist && (
                <div className="p-3 rounded-lg border"><p className="text-xs text-muted-foreground">IP Whitelist</p><p className="text-sm font-mono mt-1">{usageDetailId.ipWhitelist}</p></div>
              )}
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Scopes</p>
                <div className="flex flex-wrap gap-1">{usageDetailId.scopes.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Webhook Config Guide Dialog */}
      <Dialog open={webhookHelpOpen} onOpenChange={setWebhookHelpOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Webhook className="h-4 w-4 text-red-600" />Webhook Configuration Guide</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <h4 className="font-semibold text-xs flex items-center gap-1.5"><span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px]">1</span> Configure Your Webhook Endpoint URL</h4>
              <p className="text-xs text-muted-foreground">Create an HTTPS endpoint on your server that can receive POST requests. It should respond with <code className="bg-muted px-1 rounded text-[10px]">200 OK</code> to acknowledge receipt.</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <h4 className="font-semibold text-xs flex items-center gap-1.5"><span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px]">2</span> Set Up Event Subscriptions</h4>
              <p className="text-xs text-muted-foreground">Choose which events trigger webhooks: <code className="bg-muted px-1 rounded text-[10px]">payment.received</code>, <code className="bg-muted px-1 rounded text-[10px]">complaint.opened</code>, <code className="bg-muted px-1 rounded text-[10px]">subscriber.created</code>, etc.</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <h4 className="font-semibold text-xs flex items-center gap-1.5"><span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px]">3</span> Verify Webhook Signatures (HMAC-SHA256)</h4>
              <p className="text-xs text-muted-foreground">Each webhook includes a <code className="bg-muted px-1 rounded text-[10px]">X-Webhook-Signature</code> header. Verify it using your signing secret:</p>
              <div className="relative">
                <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto mt-1">{`const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}`}</pre>
                <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-6 w-6 p-0" onClick={() => { navigator.clipboard.writeText(`const crypto = require('crypto');\n\nfunction verifySignature(payload, signature, secret) {\n  const expected = crypto\n    .createHmac('sha256', secret)\n    .update(payload, 'utf8')\n    .digest('hex');\n  return crypto.timingSafeEqual(\n    Buffer.from(expected),\n    Buffer.from(signature)\n  );\n}`); toast.success("Copied!"); }}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <h4 className="font-semibold text-xs flex items-center gap-1.5"><span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px]">4</span> Example Webhook Payload</h4>
              <div className="relative">
                <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto">{`{
  "id": "evt_abc123",
  "event": "payment.received",
  "timestamp": "${new Date().toISOString()}",
  "data": {
    "subscriberId": "sub_001",
    "subscriberName": "John Doe",
    "amount": 599.00,
    "plan": "Fiber 100Mbps"
  },
  "signature": "sha256=a1b2c3d4..."
}`}</pre>
                <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-6 w-6 p-0" onClick={() => { navigator.clipboard.writeText(`{\n  "id": "evt_abc123",\n  "event": "payment.received",\n  "timestamp": "${new Date().toISOString()}",\n  "data": {\n    "subscriberId": "sub_001",\n    "subscriberName": "John Doe",\n    "amount": 599.00,\n    "plan": "Fiber 100Mbps"\n  },\n  "signature": "sha256=a1b2c3d4..."\n}`); toast.success("Copied!"); }}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <h4 className="font-semibold text-xs flex items-center gap-1.5"><span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px]">5</span> Test Your Webhook</h4>
              <p className="text-xs text-muted-foreground">Use the button below to send a test webhook payload to verify your endpoint is working correctly.</p>
              <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={async () => {
                try {
                  const res = await fetch("/api/api-keys/webhook/test", { method: "POST", headers: { "Content-Type": "application/json" } });
                  if (res.ok) { toast.success("Test webhook sent! Check your endpoint logs."); }
                  else { toast.error("Failed to send test webhook"); }
                } catch { toast.error("Failed to send test webhook"); }
              }}>
                <Send className="h-3 w-3" /> Send Test Webhook
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Revoke API Key</AlertDialogTitle><AlertDialogDescription>Are you sure? This will immediately disable the key. Any services using it will lose access.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Revoke Key</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
