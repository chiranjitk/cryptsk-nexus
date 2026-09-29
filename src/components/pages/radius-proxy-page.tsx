"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Globe, Plus, Search, Edit, Trash2, Server, ChevronDown, ChevronRight,
  RefreshCw, Activity, CheckCircle2, XCircle, Play, ArrowUpDown,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Switch } from "@/components/ui/switch";

// ─── Types ────────────────────────────────────────────────────────
interface ProxyServer {
  id: string;
  name: string;
  host: string;
  authPort: number;
  acctPort: number;
  type: "auth" | "acct" | "both";
  priority: number;
  status: "active" | "inactive" | "error";
  secret?: string;
  realmId: string;
}

interface ProxyRealm {
  id: string;
  name: string;
  realm: string;
  stripRealm: boolean;
  status: "active" | "inactive";
  servers: ProxyServer[];
  createdAt: string;
}

interface RealmFormData {
  name: string;
  realm: string;
  stripRealm: boolean;
  status: "active" | "inactive";
}

interface ServerFormData {
  name: string;
  host: string;
  authPort: number;
  acctPort: number;
  type: "auth" | "acct" | "both";
  priority: number;
  status: "active" | "inactive";
  secret: string;
}

// ─── Defaults ─────────────────────────────────────────────────────
const emptyRealmForm: RealmFormData = {
  name: "",
  realm: "",
  stripRealm: true,
  status: "active",
};

const emptyServerForm: ServerFormData = {
  name: "",
  host: "",
  authPort: 1812,
  acctPort: 1813,
  type: "both",
  priority: 1,
  status: "active",
  secret: "",
};

// ─── Component ────────────────────────────────────────────────────
export default function RadiusProxyPage() {
  const [realms, setRealms] = useState<ProxyRealm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRealmId, setSelectedRealmId] = useState<string | null>(null);
  const [expandedRealmId, setExpandedRealmId] = useState<string | null>(null);

  // Realm CRUD
  const [realmDialogOpen, setRealmDialogOpen] = useState(false);
  const [editingRealm, setEditingRealm] = useState<ProxyRealm | null>(null);
  const [realmForm, setRealmForm] = useState<RealmFormData>(emptyRealmForm);
  const [realmSaving, setRealmSaving] = useState(false);

  // Server CRUD
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ProxyServer | null>(null);
  const [serverForm, setServerForm] = useState<ServerFormData>(emptyServerForm);
  const [serverSaving, setServerSaving] = useState(false);
  const [deleteServerOpen, setDeleteServerOpen] = useState(false);
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null);

  // Test connectivity
  const [testingServerId, setTestingServerId] = useState<string | null>(null);

  // ─── Data fetching ───
  const fetchRealms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ realms: ProxyRealm[] }>("/api/radius-proxy/realms");
      setRealms(data.realms || []);
    } catch {
      toast.error("Failed to load proxy realms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRealms(); }, [fetchRealms]);

  // ─── Helpers ───
  const selectedRealm = realms.find((r) => r.id === selectedRealmId);
  const filteredRealms = realms.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.realm.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Realm handlers ───
  function openAddRealm() {
    setEditingRealm(null);
    setRealmForm(emptyRealmForm);
    setRealmDialogOpen(true);
  }

  function openEditRealm(realm: ProxyRealm) {
    setEditingRealm(realm);
    setRealmForm({
      name: realm.name,
      realm: realm.realm,
      stripRealm: realm.stripRealm,
      status: realm.status,
    });
    setRealmDialogOpen(true);
  }

  async function saveRealm() {
    if (!realmForm.name.trim() || !realmForm.realm.trim()) {
      toast.error("Name and realm are required");
      return;
    }
    setRealmSaving(true);
    try {
      if (editingRealm) {
        await apiFetch(`/api/radius-proxy/realms/${editingRealm.id}`, {
          method: "PUT",
          body: JSON.stringify(realmForm),
        });
        toast.success("Realm updated successfully");
      } else {
        await apiFetch("/api/radius-proxy/realms", {
          method: "POST",
          body: JSON.stringify(realmForm),
        });
        toast.success("Realm created successfully");
      }
      setRealmDialogOpen(false);
      fetchRealms();
    } catch {
      toast.error("Failed to save realm");
    } finally {
      setRealmSaving(false);
    }
  }

  // ─── Server handlers ───
  function openAddServer() {
    if (!selectedRealmId) {
      toast.error("Select a realm first");
      return;
    }
    setEditingServer(null);
    setServerForm(emptyServerForm);
    setServerDialogOpen(true);
  }

  function openEditServer(server: ProxyServer) {
    setEditingServer(server);
    setServerForm({
      name: server.name,
      host: server.host,
      authPort: server.authPort,
      acctPort: server.acctPort,
      type: server.type,
      priority: server.priority,
      status: server.status,
      secret: server.secret || "",
    });
    setServerDialogOpen(true);
  }

  async function saveServer() {
    if (!serverForm.name.trim() || !serverForm.host.trim()) {
      toast.error("Server name and host are required");
      return;
    }
    setServerSaving(true);
    try {
      if (editingServer) {
        await apiFetch(`/api/radius-proxy/servers/${editingServer.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...serverForm, realmId: selectedRealmId }),
        });
        toast.success("Server updated successfully");
      } else {
        await apiFetch("/api/radius-proxy/servers", {
          method: "POST",
          body: JSON.stringify({ ...serverForm, realmId: selectedRealmId }),
        });
        toast.success("Server added to realm");
      }
      setServerDialogOpen(false);
      fetchRealms();
    } catch {
      toast.error("Failed to save server");
    } finally {
      setServerSaving(false);
    }
  }

  async function deleteServer() {
    if (!deletingServerId) return;
    try {
      await apiFetch(`/api/radius-proxy/servers/${deletingServerId}`, { method: "DELETE" });
      toast.success("Server removed");
      setDeleteServerOpen(false);
      setDeletingServerId(null);
      fetchRealms();
    } catch {
      toast.error("Failed to delete server");
    }
  }

  async function testConnectivity(server: ProxyServer) {
    setTestingServerId(server.id);
    try {
      const result = await apiFetch<{ success: boolean; latencyMs?: number; message?: string }>(
        `/api/radius-proxy/servers/${server.id}/test`,
        { method: "POST" }
      );
      if (result.success) {
        toast.success(`Server ${server.host} reachable (${result.latencyMs}ms)`);
      } else {
        toast.error(`Server ${server.host} unreachable: ${result.message || "Unknown error"}`);
      }
    } catch {
      toast.error(`Connectivity test failed for ${server.host}`);
    } finally {
      setTestingServerId(null);
    }
  }

  function selectRealm(id: string) {
    setSelectedRealmId(id);
    setExpandedRealmId(id);
  }

  // ─── Status helpers ───
  function statusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
      case "inactive":
        return <Badge variant="secondary" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />Inactive</Badge>;
      case "error":
        return <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
    }
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <Skeleton className="skeleton-wave h-10 w-full" />
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
        title="RADIUS Proxy"
        description="Configure proxy realms and destination servers for RADIUS request forwarding."
        icon={Globe}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={fetchRealms}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddRealm}>
              <Plus className="h-4 w-4 mr-2" />Add Realm
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 rounded-xl ring-1 ring-teal-200/60 dark:ring-teal-800/40 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/50 dark:to-cyan-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm shadow-teal-500/25"><Globe className="h-4 w-4 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground">{realms.length}</p>
                <p className="text-xs text-muted-foreground font-medium">Total Realms</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><CheckCircle2 className="h-4 w-4 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{realms.filter((r) => r.status === "active").length}</p>
                <p className="text-xs text-muted-foreground font-medium">Active Realms</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-sm shadow-amber-500/25"><Server className="h-4 w-4 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{realms.reduce((sum, r) => sum + r.servers.length, 0)}</p>
                <p className="text-xs text-muted-foreground font-medium">Total Servers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl ring-1 ring-rose-200/60 dark:ring-rose-800/40 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/50 dark:to-pink-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-sm shadow-rose-500/25"><Activity className="h-4 w-4 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-300">{realms.filter((r) => r.servers.some((s) => s.status === "error")).length}</p>
                <p className="text-xs text-muted-foreground font-medium">Realms with Errors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="realms" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="realms" className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Realms</TabsTrigger>
          <TabsTrigger value="servers" className="flex items-center gap-1.5" disabled={!selectedRealmId}>
            <Server className="h-3.5 w-3.5" />
            {selectedRealm ? `Servers — ${selectedRealm.name}` : "Servers"}
          </TabsTrigger>
        </TabsList>

        {/* ─── Realms Tab ─── */}
        <TabsContent value="realms" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search realms by name or realm suffix..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Realm</TableHead>
                      <TableHead className="text-xs">Strip Realm</TableHead>
                      <TableHead className="text-xs">Servers</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRealms.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          {search ? "No realms match your search" : "No proxy realms configured. Add a realm to start forwarding RADIUS requests."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRealms.map((realm) => (
                        <RealmRow
                          key={realm.id}
                          realm={realm}
                          isExpanded={expandedRealmId === realm.id}
                          onToggle={() => setExpandedRealmId(expandedRealmId === realm.id ? null : realm.id)}
                          onSelect={() => selectRealm(realm.id)}
                          onEdit={() => openEditRealm(realm)}
                          statusBadge={statusBadge}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Servers Tab ─── */}
        <TabsContent value="servers" className="space-y-4">
          {selectedRealm && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Servers for realm <span className="font-medium text-foreground">{selectedRealm.name}</span> ({selectedRealm.realm})
                </p>
                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddServer}>
                  <Plus className="h-4 w-4 mr-2" />Add Server
                </Button>
              </div>

              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Host</TableHead>
                          <TableHead className="text-xs">Auth Port</TableHead>
                          <TableHead className="text-xs">Acct Port</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Type</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Priority</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedRealm.servers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                              No servers configured for this realm. Add a server to forward requests.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedRealm.servers.map((server) => (
                            <TableRow key={server.id} className="hover:bg-muted/50 transition-colors duration-150">
                              <TableCell className="font-medium text-sm">{server.name}</TableCell>
                              <TableCell className="font-mono text-xs">{server.host}</TableCell>
                              <TableCell className="text-xs tabular-nums">{server.authPort}</TableCell>
                              <TableCell className="text-xs tabular-nums">{server.acctPort}</TableCell>
                              <TableCell className="text-xs hidden md:table-cell">
                                <Badge variant="outline" className="text-[10px]">
                                  {server.type === "auth" && "Auth Only"}
                                  {server.type === "acct" && "Acct Only"}
                                  {server.type === "both" && "Auth + Acct"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs tabular-nums hidden md:table-cell">{server.priority}</TableCell>
                              <TableCell>{statusBadge(server.status)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="Test Connectivity"
                                    disabled={testingServerId === server.id}
                                    onClick={() => testConnectivity(server)}
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditServer(server)}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600"
                                    onClick={() => { setDeletingServerId(server.id); setDeleteServerOpen(true); }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Realm Add/Edit Dialog ─── */}
      <Dialog open={realmDialogOpen} onOpenChange={setRealmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRealm ? "Edit Realm" : "Add Proxy Realm"}</DialogTitle>
            <DialogDescription>
              {editingRealm ? "Update proxy realm configuration." : "Configure a new proxy realm for RADIUS request forwarding."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="realm-name">Realm Name</Label>
              <Input id="realm-name" value={realmForm.name} onChange={(e) => setRealmForm({ ...realmForm, name: e.target.value })} placeholder="e.g., upstream-provider" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="realm-suffix">Realm Suffix</Label>
              <Input id="realm-suffix" value={realmForm.realm} onChange={(e) => setRealmForm({ ...realmForm, realm: e.target.value })} placeholder="e.g., @isp.net" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="strip-realm" className="text-sm font-medium">Strip Realm</Label>
                <p className="text-xs text-muted-foreground">Remove realm suffix before forwarding to destination</p>
              </div>
              <Switch id="strip-realm" checked={realmForm.stripRealm} onCheckedChange={(checked) => setRealmForm({ ...realmForm, stripRealm: checked })} />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={realmForm.status} onValueChange={(val) => setRealmForm({ ...realmForm, status: val as "active" | "inactive" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRealmDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveRealm} disabled={realmSaving}>
              {realmSaving ? "Saving..." : editingRealm ? "Update Realm" : "Create Realm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Server Add/Edit Dialog ─── */}
      <Dialog open={serverDialogOpen} onOpenChange={setServerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingServer ? "Edit Server" : "Add Proxy Server"}</DialogTitle>
            <DialogDescription>
              {editingServer ? "Update proxy server configuration." : `Add a new RADIUS server to realm "${selectedRealm?.name}"`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="server-name">Server Name</Label>
              <Input id="server-name" value={serverForm.name} onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })} placeholder="e.g., primary-radius" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="server-host">Host Address</Label>
              <Input id="server-host" value={serverForm.host} onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })} placeholder="e.g., 10.0.1.100 or radius.isp.net" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="auth-port">Auth Port</Label>
                <Input id="auth-port" type="number" value={serverForm.authPort} onChange={(e) => setServerForm({ ...serverForm, authPort: parseInt(e.target.value) || 1812 })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acct-port">Acct Port</Label>
                <Input id="acct-port" type="number" value={serverForm.acctPort} onChange={(e) => setServerForm({ ...serverForm, acctPort: parseInt(e.target.value) || 1813 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Server Type</Label>
                <Select value={serverForm.type} onValueChange={(val) => setServerForm({ ...serverForm, type: val as "auth" | "acct" | "both" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auth">Auth Only</SelectItem>
                    <SelectItem value="acct">Acct Only</SelectItem>
                    <SelectItem value="both">Auth + Acct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Input id="priority" type="number" value={serverForm.priority} onChange={(e) => setServerForm({ ...serverForm, priority: parseInt(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="server-secret">Shared Secret</Label>
              <Input id="server-secret" type="password" value={serverForm.secret} onChange={(e) => setServerForm({ ...serverForm, secret: e.target.value })} placeholder="RADIUS shared secret" />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={serverForm.status} onValueChange={(val) => setServerForm({ ...serverForm, status: val as "active" | "inactive" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServerDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveServer} disabled={serverSaving}>
              {serverSaving ? "Saving..." : editingServer ? "Update Server" : "Add Server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Server Confirmation ─── */}
      <AlertDialog open={deleteServerOpen} onOpenChange={setDeleteServerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Proxy Server</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the server from the realm. RADIUS requests will no longer be forwarded to this server. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={deleteServer}>
              Delete Server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-Component: Expandable Realm Row ─────────────────────────
function RealmRow({
  realm,
  isExpanded,
  onToggle,
  onSelect,
  onEdit,
  statusBadge,
}: {
  realm: ProxyRealm;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onEdit: () => void;
  statusBadge: (status: string) => React.ReactNode;
}) {
  return (
    <>
      <TableRow className="hover:bg-muted/50 transition-colors duration-150 cursor-pointer" onClick={onToggle}>
        <TableCell className="w-8">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium text-sm">{realm.name}</TableCell>
        <TableCell className="font-mono text-xs">{realm.realm}</TableCell>
        <TableCell>
          <Badge variant={realm.stripRealm ? "default" : "outline"} className="text-[10px]">
            {realm.stripRealm ? "Yes" : "No"}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
            {realm.servers.length} server{realm.servers.length !== 1 ? "s" : ""}
          </Badge>
        </TableCell>
        <TableCell>{statusBadge(realm.status)}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
              <Server className="h-3 w-3 mr-1" />View Servers
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={7} className="p-4">
            <div className="ml-8 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destination Servers</p>
              {realm.servers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No servers configured for this realm.</p>
              ) : (
                <div className="grid gap-2">
                  {realm.servers.map((server) => (
                    <div key={server.id} className="flex items-center justify-between rounded-lg border p-3 bg-background">
                      <div className="flex items-center gap-4">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-sm font-medium">{server.name}</span>
                          <span className="text-xs text-muted-foreground ml-2 font-mono">{server.host}:{server.authPort}/{server.acctPort}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{server.type}</Badge>
                        <span className="text-xs text-muted-foreground">Priority {server.priority}</span>
                        {statusBadge(server.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
