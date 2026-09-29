"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Activity,
  Plus,
  Trash2,
  Play,
  Pause,
  RefreshCw,
  Globe,
  Network,
  Shield,
  AlertTriangle,
  Clock,
  Zap,
  Search,
  Eye,
  Server,
  CheckSquare,
  Square,
} from "lucide-react";

interface MonitorTarget {
  id: string;
  name: string;
  type: string;
  target: string;
  interval: number;
  retries: number;
  timeout: number;
  paused: boolean;
  createdAt: string;
  lastCheck: { id: string; status: string; latency: number | null; statusCode: number | null; message: string | null; createdAt: string } | null;
  totalChecks: number;
  upChecks: number;
  uptimePercent: number;
}

interface CheckRecord {
  id: string;
  targetId: string;
  status: string;
  latency: number | null;
  statusCode: number | null;
  message: string | null;
  createdAt: string;
  target: { name: string; type: string; target: string };
}

interface Incident {
  id: string;
  targetName: string;
  targetId: string;
  startAt: string;
  endAt: string | null;
  checks: number;
  message: string | null;
}

function typeIcon(type: string) {
  switch (type) {
    case "http": return <Globe className="h-4 w-4" />;
    case "ping": return <Zap className="h-4 w-4" />;
    case "tcp": return <Network className="h-4 w-4" />;
    case "dns": return <Shield className="h-4 w-4" />;
    default: return <Activity className="h-4 w-4" />;
  }
}

function statusBadge(status: string) {
  if (status === "up") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">UP</Badge>;
  if (status === "down") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0">DOWN</Badge>;
  if (status === "timeout") return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">TIMEOUT</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function uptimeColor(pct: number): string {
  if (pct >= 99) return "text-emerald-600";
  if (pct >= 95) return "text-amber-600";
  return "text-red-600";
}

interface SuggestedService {
  name: string;
  type: string;
  target: string;
  interval: number;
}

export default function UptimeMonitorPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [historyTarget, setHistoryTarget] = useState("all");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "http", target: "", interval: "60", retries: "3", timeout: "10" });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [quickAddFilter, setQuickAddFilter] = useState("");

  const { data: statusData, isLoading } = useQuery<{ targets: MonitorTarget[] }>({
    queryKey: ["uptime-status"],
    queryFn: () => apiFetch("/api/uptime-monitor?action=status"),
    refetchInterval: 10000,
  });

  const { data: historyData } = useQuery<{ checks: CheckRecord[]; total: number }>({
    queryKey: ["uptime-history", historyTarget, historyStatus],
    queryFn: () => apiFetch(`/api/uptime-monitor?action=history&limit=200&targetId=${historyTarget}&status=${historyStatus}`),
    refetchInterval: 15000,
  });

  const { data: incidentsData } = useQuery<{ incidents: Incident[] }>({
    queryKey: ["uptime-incidents"],
    queryFn: () => apiFetch("/api/uptime-monitor?action=incidents"),
    refetchInterval: 30000,
  });

  const addTargetMutation = useMutation({
    mutationFn: () => apiFetch("/api/uptime-monitor", {
      method: "POST",
      body: JSON.stringify({ action: "add-target", ...form, interval: parseInt(form.interval), retries: parseInt(form.retries), timeout: parseInt(form.timeout) }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uptime-status"] });
      setAddOpen(false);
      setForm({ name: "", type: "http", target: "", interval: "60", retries: "3", timeout: "10" });
      toast({ title: "Monitor Added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/uptime-monitor", { method: "POST", body: JSON.stringify({ action: "remove-target", id }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["uptime-status"] }); toast({ title: "Monitor Removed" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiFetch("/api/uptime-monitor", { method: "POST", body: JSON.stringify({ action, id }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["uptime-status"] }); toast({ title: "Updated" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const checkNowMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/uptime-monitor", { method: "POST", body: JSON.stringify({ action: "check-now", id }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["uptime-status"] }); toast({ title: "Check triggered" }); },
  });

  const { data: suggestedData, isLoading: suggestedLoading } = useQuery<{ services: SuggestedService[] }>({
    queryKey: ["uptime-suggested-services"],
    queryFn: () => apiFetch("/api/uptime-monitor?action=suggested-services"),
    enabled: quickAddOpen,
  });

  const bulkAddMutation = useMutation({
    mutationFn: (services: SuggestedService[]) =>
      apiFetch("/api/uptime-monitor", {
        method: "POST",
        body: JSON.stringify({ action: "bulk-add", services }),
      }),
    onSuccess: (data: { added: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["uptime-status"] });
      setQuickAddOpen(false);
      setSelectedServices(new Set());
      toast({ title: `${data.added} services added`, description: `${data.total - data.added} skipped (already exist or invalid)` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const targets = statusData?.targets || [];

  const existingTargets = new Set(targets.map((t) => `${t.name}:${t.target}`));
  const suggestedServices = suggestedData?.services || [];
  const filteredSuggestions = suggestedServices.filter(
    (s) => !quickAddFilter || s.name.toLowerCase().includes(quickAddFilter.toLowerCase()) || s.target.toLowerCase().includes(quickAddFilter.toLowerCase())
  );
  const availableSuggestions = filteredSuggestions.filter((s) => !existingTargets.has(`${s.name}:${s.target}`));
  const allAvailableSelected = availableSuggestions.every((s) => selectedServices.has(`${s.name}:${s.target}`)) && availableSuggestions.length > 0;

  const toggleServiceSelection = (service: SuggestedService) => {
    const key = `${service.name}:${service.target}`;
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllAvailable = () => {
    const all = new Set(selectedServices);
    availableSuggestions.forEach((s) => all.add(`${s.name}:${s.target}`));
    setSelectedServices(all);
  };

  const deselectAllAvailable = () => {
    setSelectedServices(new Set());
  };

  const handleBulkAdd = () => {
    const servicesToAdd = suggestedServices.filter((s) => selectedServices.has(`${s.name}:${s.target}`));
    if (servicesToAdd.length === 0) {
      toast({ title: "No services selected" });
      return;
    }
    bulkAddMutation.mutate(servicesToAdd);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/uptime-monitor", {
        method: "POST",
        body: JSON.stringify({ action: "check-now", id: "__test__", ...form, type: form.type, target: form.target, timeout: parseInt(form.timeout) }),
      });
      setTestResult(JSON.stringify(res));
    } catch (err: unknown) {
      setTestResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTesting(false);
  };
  const filteredTargets = filter === "all" ? targets : filter === "paused" ? targets.filter((t) => t.paused) : targets.filter((t) => t.lastCheck?.status === filter);

  const overallUptime = targets.length > 0
    ? targets.reduce((sum, t) => sum + t.uptimePercent, 0) / targets.length
    : 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uptime Monitor"
        description="Monitor service availability with HTTP, ping, TCP, and DNS checks"
        icon={Activity}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setQuickAddOpen(true)}>
              <Server className="mr-2 h-4 w-4" /> Quick Add ISP Services
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Monitor
            </Button>
          </div>
        }
      />

      {/* Quick Add ISP Services Dialog — rendered at page root to avoid clipping */}
      <Dialog open={quickAddOpen} onOpenChange={(open) => { setQuickAddOpen(open); if (!open) setSelectedServices(new Set()); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Quick Add ISP Services</DialogTitle>
            <DialogDescription>Select common ISP services to start monitoring</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter services..."
                  value={quickAddFilter}
                  onChange={(e) => setQuickAddFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllAvailable} disabled={!allAvailableSelected} className="h-7 text-xs">
                <CheckSquare className="mr-1 h-3 w-3" /> Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAllAvailable} disabled={selectedServices.size === 0} className="h-7 text-xs">
                <Square className="mr-1 h-3 w-3" /> Deselect All
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">{selectedServices.size} selected</span>
            </div>
            <ScrollArea className="flex-1 rounded-md border">
              <div className="p-2 space-y-1">
                {suggestedLoading ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Loading services...</div>
                ) : filteredSuggestions.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No services found</div>
                ) : (
                  filteredSuggestions.map((svc) => {
                    const key = `${svc.name}:${svc.target}`;
                    const alreadyExists = existingTargets.has(key);
                    const isSelected = selectedServices.has(key);
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors ${
                          alreadyExists ? "opacity-50 cursor-not-allowed" : isSelected ? "bg-primary/5" : "hover:bg-muted"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={alreadyExists}
                          onCheckedChange={() => toggleServiceSelection(svc)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {typeIcon(svc.type)}
                            <span className="text-sm font-medium truncate">{svc.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground truncate block">{svc.target} · {svc.interval}s interval</span>
                        </div>
                        {alreadyExists && <Badge variant="secondary" className="text-xs shrink-0">Added</Badge>}
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              onClick={handleBulkAdd}
              disabled={selectedServices.size === 0 || bulkAddMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkAddMutation.isPending ? "Adding..." : `Add ${selectedServices.size} Services`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Monitor Dialog — rendered at page root to avoid clipping */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Monitor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input placeholder="e.g. Main Website" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="ping">Ping</SelectItem>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="dns">DNS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target</Label>
                <Input placeholder={form.type === "tcp" ? "host:port" : form.type === "http" ? "https://..." : "hostname/IP"} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Interval (s)</Label>
                <Input type="number" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} />
              </div>
              <div>
                <Label>Retries</Label>
                <Input type="number" value={form.retries} onChange={(e) => setForm({ ...form, retries: e.target.value })} />
              </div>
              <div>
                <Label>Timeout (s)</Label>
                <Input type="number" value={form.timeout} onChange={(e) => setForm({ ...form, timeout: e.target.value })} />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || !form.target}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            {testResult && (
              <p className="text-xs bg-muted p-2 rounded font-mono break-all">{testResult}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => addTargetMutation.mutate()} disabled={!form.name || !form.target} className="bg-red-600 hover:bg-red-700">
              Add Monitor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 mt-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Activity className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-3xl font-bold">{targets.length}</p>
                <p className="text-xs text-muted-foreground">Monitors</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className={`text-3xl font-bold ${uptimeColor(overallUptime)}`}>{overallUptime.toFixed(2)}%</p>
                <p className="text-xs text-muted-foreground">Overall Uptime</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-emerald-600">{targets.filter((t) => t.lastCheck?.status === "up").length}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{targets.filter((t) => t.lastCheck?.status === "down" || t.lastCheck?.status === "timeout").length}</p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            {["all", "up", "down", "timeout", "paused"].map((f) => (
              <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>

          {/* Targets Grid */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredTargets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No monitors yet. Click &quot;Add Monitor&quot; to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTargets.map((t) => (
                <Card key={t.id} className={t.lastCheck?.status === "down" || t.lastCheck?.status === "timeout" ? "border-red-200" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {typeIcon(t.type)}
                        <CardTitle className="text-sm font-medium">{t.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1">
                        {statusBadge(t.lastCheck?.status ?? (t.paused ? "paused" : "unknown"))}
                        {t.paused && <Badge variant="outline" className="text-xs">PAUSED</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground truncate">{t.target}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Latency:</span>
                      <span className="font-medium">{t.lastCheck?.latency != null ? `${t.lastCheck.latency.toFixed(1)} ms` : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Uptime:</span>
                      <span className={`font-medium ${uptimeColor(t.uptimePercent)}`}>{t.uptimePercent.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Checks:</span>
                      <span className="font-medium">{t.totalChecks}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Last check: {t.lastCheck?.createdAt ? new Date(t.lastCheck.createdAt).toLocaleTimeString() : "Never"}</span>
                    </div>
                    <div className="flex items-center gap-1 pt-2 border-t">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => checkNowMutation.mutate(t.id)}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Check
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleMutation.mutate({ id: t.id, action: t.paused ? "resume" : "pause" })}>
                        {t.paused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                        {t.paused ? "Resume" : "Pause"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => removeMutation.mutate(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Select value={historyTarget} onValueChange={setHistoryTarget}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All targets" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Targets</SelectItem>
                {targets.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={historyStatus} onValueChange={setHistoryStatus}>
              <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="up">Up</SelectItem>
                <SelectItem value="down">Down</SelectItem>
                <SelectItem value="timeout">Timeout</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>HTTP Code</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(historyData?.checks || []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(c.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{c.target.name}</TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                        <TableCell className="text-xs">
                          {c.latency != null ? `${c.latency.toFixed(1)} ms` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{c.statusCode ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{c.message ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {(historyData?.checks || []).length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No check history</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Target</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Checks</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(incidentsData?.incidents || []).map((inc) => {
                      const start = new Date(inc.startAt);
                      const end = inc.endAt ? new Date(inc.endAt) : new Date();
                      const durMs = end.getTime() - start.getTime();
                      const durMin = Math.floor(durMs / 60000);
                      const durH = Math.floor(durMin / 60);
                      const durStr = durH > 0 ? `${durH}h ${durMin % 60}m` : `${durMin}m`;
                      return (
                        <TableRow key={inc.id}>
                          <TableCell className="font-medium text-sm">{inc.targetName}</TableCell>
                          <TableCell className="text-xs">{start.toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{inc.endAt ? new Date(inc.endAt).toLocaleString() : "Ongoing"}</TableCell>
                          <TableCell><Badge variant="destructive" className="text-xs">{durStr}</Badge></TableCell>
                          <TableCell className="text-xs">{inc.checks}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{inc.message ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                    {(incidentsData?.incidents || []).length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No incidents recorded</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
