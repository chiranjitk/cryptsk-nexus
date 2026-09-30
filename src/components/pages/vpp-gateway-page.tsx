"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Activity,
  Server,
  Network,
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Cpu,
  Settings,
  AlertTriangle,
  Shield,
  Database,
  Layers,
  Users,
  Boxes,
  Power,
  Trash2,
  Plus,
  Download,
  Search,
  Gauge,
  Clock,
  Filter,
  BarChart3,
  Cpu as CpuIcon,
  PlayCircle,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// Shared types & helpers
// ─────────────────────────────────────────────────────────────────
type AnyRecord = Record<string, any>;

function formatBytes(bytes: number | string | undefined | null): string {
  if (bytes === undefined || bytes === null) return "—";
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(n) || n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTime(iso: string | number | undefined | null): string {
  if (!iso) return "—";
  try {
    const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function truncate(s: string | undefined | null, n = 12): string {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Status badge colors (slate/emerald/amber/red — no indigo/blue)
function statusBadgeVariant(
  status: string | undefined | null
): { className: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const s = (status || "").toUpperCase();
  if (["UP", "ACTIVE", "OK", "CONNECTED", "HEALTHY", "VERIFIED", "FRESH", "PROGRAMMED"].includes(s)) {
    return { className: "bg-emerald-100 text-emerald-800 border-emerald-200", variant: "outline" };
  }
  if (["DOWN", "ERROR", "FAILED", "STALE", "DISCONNECTED"].includes(s)) {
    return { className: "bg-red-100 text-red-800 border-red-200", variant: "outline" };
  }
  if (["RECOVERING", "PENDING", "WARNING", "WARN"].includes(s)) {
    return { className: "bg-amber-100 text-amber-800 border-amber-200", variant: "outline" };
  }
  return { className: "bg-slate-100 text-slate-700 border-slate-200", variant: "outline" };
}

function riskBadge(level: string | undefined | null): React.ReactNode {
  const l = (level || "").toUpperCase();
  if (l === "CRITICAL") {
    return <Badge className="bg-red-600 text-white border-red-700 font-bold">CRITICAL</Badge>;
  }
  if (l === "HIGH") {
    return <Badge className="bg-red-100 text-red-800 border-red-200">HIGH</Badge>;
  }
  if (l === "MEDIUM") {
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">MEDIUM</Badge>;
  }
  if (l === "LOW") {
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">LOW</Badge>;
  }
  return <Badge variant="secondary">{level || "UNKNOWN"}</Badge>;
}

// ─────────────────────────────────────────────────────────────────
// Reusable error / loading / empty cards
// ─────────────────────────────────────────────────────────────────
function ServiceUnavailable({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-medium text-red-900 dark:text-red-200">
          Service Unavailable
        </div>
        <div className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">
          {message ||
            "Could not reach the VPP adapter, session-engine, or nat-logger service. The parallel subagent building this service may still be running."}
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
            onClick={onRetry}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 1: OVERVIEW
// ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  loading,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  color: string;
  loading?: boolean;
  sub?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 font-medium text-muted-foreground">
          <Icon className={`h-4 w-4 ${color}`} />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewTab() {
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);

  const healthQ = useQuery({
    queryKey: ["vpp-health"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 5000 : false,
    retry: 1,
  });

  const stateQ = useQuery({
    queryKey: ["vpp-state"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=state");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 1,
  });

  const interfacesQ = useQuery({
    queryKey: ["vpp-interfaces"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=interfaces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 1,
  });

  const configQ = useQuery({
    queryKey: ["vpp-config"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=config-generate");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: false,
    retry: 1,
  });

  const recoveryQ = useQuery({
    queryKey: ["vpp-recovery-logs"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=recovery-logs");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 1,
  });

  const simulateRestartMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/vpp?action=simulate-restart", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("VPP restart simulated — recovery should begin");
      queryClient.invalidateQueries({ queryKey: ["vpp-recovery-logs"] });
      queryClient.invalidateQueries({ queryKey: ["vpp-health"] });
    },
    onError: (err: Error) => toast.error(err.message || "Simulate restart failed"),
  });

  const triggerRecoveryMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/vpp?action=restart-recovery", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("VPP recovery triggered");
      queryClient.invalidateQueries({ queryKey: ["vpp-recovery-logs"] });
      queryClient.invalidateQueries({ queryKey: ["vpp-state"] });
    },
    onError: (err: Error) => toast.error(err.message || "Recovery trigger failed"),
  });

  const reconcileMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/vpp?action=reconcile", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Dataplane reconciliation complete");
      queryClient.invalidateQueries({ queryKey: ["vpp-config"] });
      queryClient.invalidateQueries({ queryKey: ["vpp-state"] });
    },
    onError: (err: Error) => toast.error(err.message || "Reconcile failed"),
  });

  const downloadConfig = () => {
    const txt =
      configQ.data?.config || configQ.data?.configText || JSON.stringify(configQ.data || {}, null, 2);
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vpp-config-${Date.now()}.conf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Config downloaded");
  };

  const health: AnyRecord = healthQ.data || {};
  const state: AnyRecord = stateQ.data || {};
  const interfaces: AnyRecord[] = interfacesQ.data?.interfaces || interfacesQ.data?.items || [];
  const recoveryLogs: AnyRecord[] = recoveryQ.data?.logs || recoveryQ.data?.items || recoveryQ.data?.data || [];
  const stats: AnyRecord = health.stats || state.stats || state.policyObjects ? state : {};
  const configText: string = configQ.data?.config || configQ.data?.configText || "";

  const vppEpoch = state.epoch ?? health.epoch ?? state.vppEpoch ?? "—";
  const policyObjectsRaw =
    state.policyObjects ?? state.policyObjectsCount ?? health.policyObjects ?? 0;
  // policyObjects may be either a number (count) OR an object {ACL:N, POLICER:N, ...}
  const policyObjectsCount =
    typeof policyObjectsRaw === "number"
      ? policyObjectsRaw
      : policyObjectsRaw && typeof policyObjectsRaw === "object"
        ? Object.values(policyObjectsRaw).reduce(
            (sum: number, v: unknown) => sum + (typeof v === "number" ? v : 0),
            0
          )
        : 0;
  const subscribersProgrammed =
    state.subscribersProgrammed ?? state.activeSubscribers ?? health.subscribersProgrammed ?? 0;
  const lastRestartAt = state.lastRestartAt ?? health.lastRestartAt;

  const healthErr = healthQ.error;
  const stateErr = stateQ.error;
  const recoveryErr = recoveryQ.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-600" />
            Dataplane Overview
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            VPP v26.06 + DPDK live state, restart recovery, and reconciliation.
          </p>
        </div>
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${autoRefresh ? "animate-spin" : ""}`} />
          {autoRefresh ? "Auto ON (5s)" : "Auto OFF"}
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Zap}
          label="VPP Epoch"
          value={vppEpoch}
          color="text-amber-600"
          loading={stateQ.isLoading && !stateErr}
          sub={stateErr ? undefined : "Rebuild counter"}
        />
        <StatCard
          icon={Boxes}
          label="Policy Objects"
          value={policyObjectsCount}
          color="text-emerald-600"
          loading={stateQ.isLoading && !stateErr}
          sub="ACL/Policer/QoS/NAT/VRF"
        />
        <StatCard
          icon={Users}
          label="Subscribers Programmed"
          value={subscribersProgrammed}
          color="text-slate-600"
          loading={stateQ.isLoading && !stateErr}
        />
        <StatCard
          icon={Clock}
          label="Last Restart"
          value={lastRestartAt ? formatTime(lastRestartAt) : "—"}
          color="text-red-600"
          loading={stateQ.isLoading && !stateErr}
        />
      </div>

      {/* Health state + connection status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-emerald-600" />
              VPP Adapter Health
            </CardTitle>
            <CardDescription>
              Live status from <code>/api/vpp?action=health</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {healthErr ? (
              <ServiceUnavailable
                message={healthErr.message}
                onRetry={() => healthQ.refetch()}
              />
            ) : healthQ.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    className={
                      health.vppConnected
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : "bg-red-100 text-red-800 border-red-200"
                    }
                  >
                    {health.status || (health.vppConnected ? "OK" : "DOWN")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">VPP Connected</span>
                  <span className="font-mono">
                    {health.vppConnected ? "YES" : "NO"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-mono">
                    {typeof health.uptime === "number" ? `${health.uptime}s` : health.uptime || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Interfaces</span>
                  <span className="font-mono">
                    {health.interfaces ?? interfaces.length}
                  </span>
                </div>
                {health.stats && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Configs Generated</span>
                    <span className="font-mono">
                      {health.stats.configsGenerated ?? 0}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5 text-emerald-600" />
              VPP Interfaces
            </CardTitle>
            <CardDescription>
              Dataplane interfaces registered with VPP
            </CardDescription>
          </CardHeader>
          <CardContent>
            {interfacesQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : interfacesQ.error ? (
              <ServiceUnavailable
                message={(interfacesQ.error as Error).message}
                onRetry={() => interfacesQ.refetch()}
              />
            ) : interfaces.length === 0 ? (
              <EmptyState
                icon={Network}
                title="No VPP interfaces"
                description="VPP adapter may be in config-generation mode only."
                size="sm"
              />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto cryptsk-scrollbar">
                {interfaces.map((iface, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border rounded-md p-3 bg-muted/30"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-medium truncate">
                        {iface.name || iface.dev_name || `iface-${i}`}
                      </div>
                      {iface.mac && (
                        <div className="text-xs text-muted-foreground">{iface.mac}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        className={
                          (iface.state === "up" || iface.link === "up")
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }
                      >
                        {iface.state || iface.link || "?"}
                      </Badge>
                      {iface.speed && (
                        <span className="text-xs text-muted-foreground">
                          {iface.speed}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* VPP Restart Recovery */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5 text-amber-600" />
            VPP Restart Recovery
          </CardTitle>
          <CardDescription>
            Last 10 recovery events (§41). The session-engine detects VPP restart,
            loads active session snapshots, rebuilds VPP policies, and verifies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => simulateRestartMut.mutate()}
              disabled={simulateRestartMut.isPending}
            >
              <Power className="h-4 w-4 mr-1.5" />
              {simulateRestartMut.isPending ? "Simulating…" : "Simulate VPP Restart"}
            </Button>
            <Button
              size="sm"
              onClick={() => triggerRecoveryMut.mutate()}
              disabled={triggerRecoveryMut.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              {triggerRecoveryMut.isPending ? "Triggering…" : "Trigger Recovery"}
            </Button>
          </div>

          {recoveryErr ? (
            <ServiceUnavailable
              message={(recoveryErr as Error).message}
              onRetry={() => recoveryQ.refetch()}
            />
          ) : recoveryQ.isLoading ? (
            <TableSkeleton rows={4} cols={6} />
          ) : recoveryLogs.length === 0 ? (
            <EmptyState
              icon={Power}
              title="No recovery events yet"
              description="VPP restart recovery has not been triggered. Click 'Simulate VPP Restart' to test."
              size="sm"
            />
          ) : (
            <div className="max-h-96 overflow-y-auto cryptsk-scrollbar rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Epoch</TableHead>
                    <TableHead>Sessions Affected</TableHead>
                    <TableHead>Recovered / Failed</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recoveryLogs.slice(0, 10).map((log, i) => {
                    const prevEpoch = log.prevEpoch ?? log.previousEpoch;
                    const newEpoch = log.newEpoch ?? log.currentEpoch;
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              (log.event || "").includes("FAIL")
                                ? "bg-red-100 text-red-800 border-red-200"
                                : "bg-emerald-100 text-emerald-800 border-emerald-200"
                            }
                          >
                            {log.event || log.eventType || "RECOVERY"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {prevEpoch !== undefined ? `${prevEpoch} → ${newEpoch}` : newEpoch ?? "—"}
                        </TableCell>
                        <TableCell>{log.sessionsAffected ?? log.affected ?? "—"}</TableCell>
                        <TableCell>
                          <span className="text-emerald-700 font-medium">
                            {log.sessionsRecovered ?? log.recovered ?? 0}
                          </span>
                          {" / "}
                          <span className="text-red-700 font-medium">
                            {log.sessionsFailed ?? log.failed ?? 0}
                          </span>
                        </TableCell>
                        <TableCell>{formatDuration(log.durationMs ?? log.duration)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(log.createdAt ?? log.timestamp)}
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

      {/* Config + Reconcile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-slate-600" />
              Generated VPP Config
            </CardTitle>
            <CardDescription>
              Live-generated dataplane configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configQ.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : configQ.error ? (
              <ServiceUnavailable
                message={(configQ.error as Error).message}
                onRetry={() => configQ.refetch()}
              />
            ) : (
              <>
                <pre className="text-xs bg-muted/60 dark:bg-muted/30 p-3 rounded-md overflow-auto max-h-96 cryptsk-scrollbar whitespace-pre-wrap border">
                  {configText || "No config generated"}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={downloadConfig}
                  disabled={!configText}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download .conf
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-slate-600" />
              Dataplane Reconciliation
            </CardTitle>
            <CardDescription>
              Force VPP config regeneration from OSS/BSS state (subscribers, policies, NAS).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => reconcileMut.mutate()}
              disabled={reconcileMut.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1.5 ${reconcileMut.isPending ? "animate-spin" : ""}`}
              />
              {reconcileMut.isPending ? "Reconciling…" : "Reconcile Now"}
            </Button>
            {reconcileMut.data && (
              <pre className="mt-3 text-xs bg-muted/60 dark:bg-muted/30 p-2 rounded-md border max-h-48 overflow-auto cryptsk-scrollbar">
                {JSON.stringify(reconcileMut.data, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 2: POLICY OBJECTS
// ─────────────────────────────────────────────────────────────────
function PolicyObjectRow({
  obj,
  kind,
  onDelete,
}: {
  obj: AnyRecord;
  kind: "acl" | "nat" | "policy";
  onDelete: (obj: AnyRecord) => void;
}) {
  const id = obj.id || obj._id || obj.name;
  const name = obj.name || obj.profileName || "(unnamed)";
  const desc = obj.description || obj.desc;
  const isEnabled = obj.isEnabled ?? obj.enabled ?? true;
  const type = obj.type || obj.policyType || obj.mode;
  const created = obj.createdAt || obj.created;
  const updated = obj.updatedAt || obj.updated;

  return (
    <TableRow>
      <TableCell className="font-mono font-medium">{name}</TableCell>
      {(kind === "policy" || kind === "acl") && (
        <TableCell>
          {type && <Badge variant="secondary">{type}</Badge>}
        </TableCell>
      )}
      <TableCell className="text-muted-foreground text-xs max-w-xs truncate">
        {desc || "—"}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            isEnabled
              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }
        >
          {isEnabled ? "ENABLED" : "DISABLED"}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatTime(created)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:bg-red-50"
          onClick={() => onDelete(obj)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CreatePolicyObjectForm({
  kind,
  onCreate,
}: {
  kind: "acl" | "nat" | "policy";
  onCreate: (payload: AnyRecord) => void;
}) {
  // Local form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultAction, setDefaultAction] = useState("PERMIT");
  const [rulesJson, setRulesJson] = useState("[]");
  const [publicIpStart, setPublicIpStart] = useState("");
  const [publicIpEnd, setPublicIpEnd] = useState("");
  const [portStart, setPortStart] = useState("1024");
  const [portEnd, setPortEnd] = useState("65535");
  const [natMode, setNatMode] = useState("NAT44");
  const [policyType, setPolicyType] = useState("POLICER");
  const [profileId, setProfileId] = useState("");
  const [configJson, setConfigJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    let payload: AnyRecord = { name, description };
    if (kind === "acl") {
      payload.defaultAction = defaultAction;
      try {
        payload.rules = JSON.parse(rulesJson);
      } catch {
        setError("rulesJson must be valid JSON");
        return;
      }
    } else if (kind === "nat") {
      payload.publicIpStart = publicIpStart;
      payload.publicIpEnd = publicIpEnd;
      payload.portStart = parseInt(portStart, 10);
      payload.portEnd = parseInt(portEnd, 10);
      payload.mode = natMode;
    } else if (kind === "policy") {
      payload.type = policyType;
      if (profileId) payload.profileId = profileId;
      try {
        payload.config = JSON.parse(configJson);
      } catch {
        setError("config must be valid JSON");
        return;
      }
    }
    onCreate(payload);
    // Reset
    setName("");
    setDescription("");
    setRulesJson("[]");
    setConfigJson("{}");
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 dark:bg-muted/20 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`name-${kind}`}>Name</Label>
          <Input
            id={`name-${kind}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ACL-INTERNET-ONLY"
          />
        </div>
        <div>
          <Label htmlFor={`desc-${kind}`}>Description</Label>
          <Input
            id={`desc-${kind}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      {kind === "acl" && (
        <>
          <div>
            <Label>Default Action</Label>
            <Select value={defaultAction} onValueChange={setDefaultAction}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERMIT">PERMIT</SelectItem>
                <SelectItem value="DENY">DENY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`rules-${kind}`}>Rules (JSON array)</Label>
            <Textarea
              id={`rules-${kind}`}
              value={rulesJson}
              onChange={(e) => setRulesJson(e.target.value)}
              className="font-mono text-xs"
              rows={5}
              placeholder='[{"action":"PERMIT","src":"10.0.0.0/8","dst":"any"}]'
            />
          </div>
        </>
      )}

      {kind === "nat" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Public IP Start</Label>
            <Input
              value={publicIpStart}
              onChange={(e) => setPublicIpStart(e.target.value)}
              placeholder="203.0.113.10"
            />
          </div>
          <div>
            <Label>Public IP End</Label>
            <Input
              value={publicIpEnd}
              onChange={(e) => setPublicIpEnd(e.target.value)}
              placeholder="203.0.113.100"
            />
          </div>
          <div>
            <Label>Port Start</Label>
            <Input
              type="number"
              value={portStart}
              onChange={(e) => setPortStart(e.target.value)}
            />
          </div>
          <div>
            <Label>Port End</Label>
            <Input
              type="number"
              value={portEnd}
              onChange={(e) => setPortEnd(e.target.value)}
            />
          </div>
          <div className="col-span-2 md:col-span-4">
            <Label>NAT Mode</Label>
            <Select value={natMode} onValueChange={setNatMode}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NAT44">NAT44</SelectItem>
                <SelectItem value="NAT66">NAT66</SelectItem>
                <SelectItem value="CGNAT">CGNAT (carrier-grade)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {kind === "policy" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={policyType} onValueChange={setPolicyType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POLICER">POLICER</SelectItem>
                  <SelectItem value="ACL">ACL</SelectItem>
                  <SelectItem value="NAT">NAT</SelectItem>
                  <SelectItem value="VRF">VRF</SelectItem>
                  <SelectItem value="QOS">QoS</SelectItem>
                  <SelectItem value="CLASSIFICATION">CLASSIFICATION</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profile ID (optional)</Label>
              <Input
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                placeholder="Link to an ACL/NAT profile"
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`config-${kind}`}>Config (JSON)</Label>
            <Textarea
              id={`config-${kind}`}
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              className="font-mono text-xs"
              rows={4}
              placeholder='{"rate":100000000,"burst":1000000}'
            />
          </div>
        </>
      )}

      {error && (
        <div className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <Button size="sm" onClick={submit}>
        <Plus className="h-4 w-4 mr-1.5" />
        Create
      </Button>
    </div>
  );
}

function PolicyObjectsTab() {
  const queryClient = useQueryClient();
  const [showAclForm, setShowAclForm] = useState(false);
  const [showNatForm, setShowNatForm] = useState(false);
  const [showPolicyForm, setShowPolicyForm] = useState(false);

  const aclQ = useQuery({
    queryKey: ["vpp-acl-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=acl-profiles");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const natQ = useQuery({
    queryKey: ["vpp-nat-pools"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=nat-pools");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const policyQ = useQuery({
    queryKey: ["vpp-policy-objects"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=policy-objects");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const aclProfiles: AnyRecord[] = aclQ.data?.profiles || aclQ.data?.items || aclQ.data?.data || [];
  const natPools: AnyRecord[] = natQ.data?.pools || natQ.data?.items || natQ.data?.data || [];
  const policyObjects: AnyRecord[] = policyQ.data?.objects || policyQ.data?.items || policyQ.data?.data || [];

  const createMut = useMutation({
    mutationFn: async ({ kind, payload }: { kind: "acl" | "nat" | "policy"; payload: AnyRecord }) => {
      const action =
        kind === "acl"
          ? "acl-profiles-create"
          : kind === "nat"
          ? "nat-pools-create"
          : "policy-objects-create";
      const res = await fetch(`/api/vpp?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, vars) => {
      const qk =
        vars.kind === "acl"
          ? "vpp-acl-profiles"
          : vars.kind === "nat"
          ? "vpp-nat-pools"
          : "vpp-policy-objects";
      queryClient.invalidateQueries({ queryKey: [qk] });
      toast.success(`${vars.kind.toUpperCase()} object created`);
    },
    onError: (err: Error) => toast.error(err.message || "Create failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async ({ kind, id }: { kind: "acl" | "nat" | "policy"; id: string }) => {
      const action =
        kind === "acl"
          ? "acl-profiles-delete"
          : kind === "nat"
          ? "nat-pools-delete"
          : "policy-objects-delete";
      const res = await fetch(`/api/vpp?action=${action}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, vars) => {
      const qk =
        vars.kind === "acl"
          ? "vpp-acl-profiles"
          : vars.kind === "nat"
          ? "vpp-nat-pools"
          : "vpp-policy-objects";
      queryClient.invalidateQueries({ queryKey: [qk] });
      toast.success("Object deleted");
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  const onDelete = (kind: "acl" | "nat" | "policy") => (obj: AnyRecord) => {
    const id = String(obj.id || obj._id || obj.name);
    if (!id) {
      toast.error("Cannot delete — object has no identifier");
      return;
    }
    if (!window.confirm(`Delete ${obj.name || id}?`)) return;
    deleteMut.mutate({ kind, id });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-600" />
          VPP Policy Objects
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Reusable dataplane objects: ACL profiles, NAT pools, and Policier/QoS/VRF objects (§29, §32, §33).
        </p>
      </div>

      {/* ACL Profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-5 w-5 text-slate-600" />
            ACL Profiles
            <Badge variant="secondary" className="ml-2">{aclProfiles.length}</Badge>
          </CardTitle>
          <CardDescription>
            Reusable ACL profiles (ACL-GUEST, ACL-HOTEL, ACL-ISP-BASIC, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button
              size="sm"
              variant={showAclForm ? "secondary" : "outline"}
              onClick={() => setShowAclForm(!showAclForm)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {showAclForm ? "Cancel" : "New ACL Profile"}
            </Button>
          </div>
          {showAclForm && (
            <div className="mb-4">
              <CreatePolicyObjectForm
                kind="acl"
                onCreate={(payload) => createMut.mutate({ kind: "acl", payload })}
              />
            </div>
          )}
          {aclQ.isLoading ? (
            <TableSkeleton rows={3} cols={5} />
          ) : aclQ.error ? (
            <ServiceUnavailable
              message={(aclQ.error as Error).message}
              onRetry={() => aclQ.refetch()}
            />
          ) : aclProfiles.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No ACL profiles"
              description="Create an ACL profile to define reusable permit/deny rules."
              size="sm"
              action={{
                label: "Create",
                onClick: () => setShowAclForm(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aclProfiles.map((obj, i) => (
                    <PolicyObjectRow key={i} obj={obj} kind="acl" onDelete={onDelete("acl")} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* NAT Pools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-5 w-5 text-slate-600" />
            NAT Pools
            <Badge variant="secondary" className="ml-2">{natPools.length}</Badge>
          </CardTitle>
          <CardDescription>
            VPP-managed NAT pools — translation state, port allocation, NAT processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button
              size="sm"
              variant={showNatForm ? "secondary" : "outline"}
              onClick={() => setShowNatForm(!showNatForm)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {showNatForm ? "Cancel" : "New NAT Pool"}
            </Button>
          </div>
          {showNatForm && (
            <div className="mb-4">
              <CreatePolicyObjectForm
                kind="nat"
                onCreate={(payload) => createMut.mutate({ kind: "nat", payload })}
              />
            </div>
          )}
          {natQ.isLoading ? (
            <TableSkeleton rows={3} cols={5} />
          ) : natQ.error ? (
            <ServiceUnavailable
              message={(natQ.error as Error).message}
              onRetry={() => natQ.refetch()}
            />
          ) : natPools.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No NAT pools"
              description="Create a NAT pool to define public IP/port ranges."
              size="sm"
              action={{
                label: "Create",
                onClick: () => setShowNatForm(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {natPools.map((obj, i) => (
                    <PolicyObjectRow key={i} obj={obj} kind="nat" onDelete={onDelete("nat")} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Policy Objects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-5 w-5 text-slate-600" />
            Policy Objects
            <Badge variant="secondary" className="ml-2">{policyObjects.length}</Badge>
          </CardTitle>
          <CardDescription>
            Policer, QoS, VRF, Classification objects linked to subscribers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button
              size="sm"
              variant={showPolicyForm ? "secondary" : "outline"}
              onClick={() => setShowPolicyForm(!showPolicyForm)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {showPolicyForm ? "Cancel" : "New Policy Object"}
            </Button>
          </div>
          {showPolicyForm && (
            <div className="mb-4">
              <CreatePolicyObjectForm
                kind="policy"
                onCreate={(payload) => createMut.mutate({ kind: "policy", payload })}
              />
            </div>
          )}
          {policyQ.isLoading ? (
            <TableSkeleton rows={3} cols={5} />
          ) : policyQ.error ? (
            <ServiceUnavailable
              message={(policyQ.error as Error).message}
              onRetry={() => policyQ.refetch()}
            />
          ) : policyObjects.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No policy objects"
              description="Create a Policer/QoS/VRF object to bind to subscriber sessions."
              size="sm"
              action={{
                label: "Create",
                onClick: () => setShowPolicyForm(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policyObjects.map((obj, i) => (
                    <PolicyObjectRow key={i} obj={obj} kind="policy" onDelete={onDelete("policy")} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 3: SESSION SNAPSHOTS
// ─────────────────────────────────────────────────────────────────
const RECOVERY_STATES = [
  "FRESH",
  "PROGRAMMED",
  "VERIFIED",
  "RECOVERING",
  "STALE",
  "FAILED",
] as const;

function SnapshotsTab() {
  const queryClient = useQueryClient();
  const [filterState, setFilterState] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const snapshotsQ = useQuery({
    queryKey: ["vpp-snapshots", filterState, search, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterState !== "ALL") params.set("state", filterState);
      if (search) params.set("search", search);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const res = await fetch(`/api/vpp?action=snapshots&${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10000,
    retry: 1,
  });

  const rebuildMut = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(
        `/api/vpp?action=rebuild-session&sessionId=${encodeURIComponent(sessionId)}`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, sessionId) => {
      toast.success(`VPP rebuild triggered for ${truncate(sessionId)}`);
      queryClient.invalidateQueries({ queryKey: ["vpp-snapshots"] });
    },
    onError: (err: Error) => toast.error(err.message || "Rebuild failed"),
  });

  const snapshots: AnyRecord[] =
    snapshotsQ.data?.snapshots || snapshotsQ.data?.items || snapshotsQ.data?.data || [];
  const total: number = snapshotsQ.data?.total ?? snapshots.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-emerald-600" />
          Session Snapshots
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Recoverable session state — used to rebuild VPP policies after VPP restart (§42).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-600" />
              Snapshots ({total})
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => snapshotsQ.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="flex-1">
              <Label className="mb-1.5 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Username or framed IP"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="md:w-56">
              <Label className="mb-1.5 block">Recovery State</Label>
              <Select
                value={filterState}
                onValueChange={(v) => {
                  setFilterState(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All states" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All states</SelectItem>
                  {RECOVERY_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {snapshotsQ.error ? (
            <ServiceUnavailable
              message={(snapshotsQ.error as Error).message}
              onRetry={() => snapshotsQ.refetch()}
            />
          ) : snapshotsQ.isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : snapshots.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No session snapshots"
              description="Snapshots are created when subscribers are programmed into VPP. Try the Overview tab and run Reconcile Now."
              size="sm"
              action={{
                label: "Refresh",
                onClick: () => snapshotsQ.refetch(),
                icon: RefreshCw,
              }}
            />
          ) : (
            <>
              <div className="rounded-md border max-h-[480px] overflow-y-auto cryptsk-scrollbar">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Session ID</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Framed IP</TableHead>
                      <TableHead>MAC</TableHead>
                      <TableHead>VLAN</TableHead>
                      <TableHead>VRF</TableHead>
                      <TableHead>Policy ID</TableHead>
                      <TableHead>Epoch</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Programmed At</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((s, i) => {
                      const st = s.vppRecoveryState || s.recoveryState || s.state;
                      const sb = statusBadgeVariant(st);
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">
                            {truncate(s.sessionId || s.acctSessionId, 16)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {s.username || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {s.framedIp || s.framedIpAddress || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {truncate(s.mac || s.callingStationId, 16)}
                          </TableCell>
                          <TableCell>{s.vlanId || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{s.vrf || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{s.policyId || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {s.vppEpoch ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={sb.variant} className={sb.className}>
                              {st || "UNKNOWN"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTime(s.vppProgrammedAt || s.programmedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                rebuildMut.mutate(
                                  String(s.sessionId || s.acctSessionId || "")
                                )
                              }
                              disabled={
                                rebuildMut.isPending ||
                                !(s.sessionId || s.acctSessionId)
                              }
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Rebuild VPP
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} • {total} total
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 4: NAT EVENTS
// ─────────────────────────────────────────────────────────────────
function NatEventsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const eventsQ = useQuery({
    queryKey: ["nat-events-recent"],
    queryFn: async () => {
      const res = await fetch("/api/nat-logger?action=events-recent");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: 1,
  });

  const statsQ = useQuery({
    queryKey: ["nat-stats"],
    queryFn: async () => {
      const res = await fetch("/api/nat-logger?action=stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10000,
    retry: 1,
  });

  const bufferQ = useQuery({
    queryKey: ["nat-buffer"],
    queryFn: async () => {
      const res = await fetch("/api/nat-logger?action=buffer");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: 1,
  });

  const flushMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/nat-logger?action=flush", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("NAT buffer flushed");
      queryClient.invalidateQueries({ queryKey: ["nat-buffer"] });
      queryClient.invalidateQueries({ queryKey: ["nat-events-recent"] });
      queryClient.invalidateQueries({ queryKey: ["nat-stats"] });
    },
    onError: (err: Error) => toast.error(err.message || "Flush failed"),
  });

  const events: AnyRecord[] = eventsQ.data?.events || eventsQ.data?.items || eventsQ.data?.data || [];
  const stats: AnyRecord = statsQ.data || {};
  const buffer: AnyRecord = bufferQ.data || {};

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.trim().toLowerCase();
    return events.filter(
      (e) =>
        (e.dstDomain || "").toLowerCase().includes(q) ||
        (e.subscriberIp || "").toLowerCase().includes(q)
    );
  }, [events, search]);

  // Top 5 dst domains by bytes
  const topDomains = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      const d = e.dstDomain || "—";
      const b = (e.bytesSent || 0) + (e.bytesReceived || 0);
      map[d] = (map[d] || 0) + b;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [events]);
  const maxBytes = topDomains.length > 0 ? topDomains[0][1] : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-600" />
            NAT Events
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live NAT event stream from nat-logger (port 3016) — auto-refresh every 5s (§34).
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => flushMut.mutate()}
          disabled={flushMut.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${flushMut.isPending ? "animate-spin" : ""}`} />
          {flushMut.isPending ? "Flushing…" : "Force Flush"}
        </Button>
      </div>

      {/* Buffer status + stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Gauge}
          label="Buffer Size"
          value={buffer.size ?? buffer.bufferSize ?? 0}
          color="text-amber-600"
          loading={bufferQ.isLoading}
          sub={`Capacity ${buffer.capacity ?? buffer.bufferCapacity ?? "?"}`}
        />
        <StatCard
          icon={Clock}
          label="Last Flush"
          value={buffer.lastFlushAt ? formatTime(buffer.lastFlushAt) : "—"}
          color="text-slate-600"
          loading={bufferQ.isLoading}
        />
        <StatCard
          icon={BarChart3}
          label="Events (60m)"
          value={stats.totalLast60Min ?? stats.eventsLast60Min ?? 0}
          color="text-emerald-600"
          loading={statsQ.isLoading}
        />
        <StatCard
          icon={Activity}
          label="Total Logged"
          value={stats.totalEvents ?? stats.total ?? 0}
          color="text-slate-600"
          loading={statsQ.isLoading}
        />
      </div>

      {/* Top domains bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-slate-600" />
            Top 5 Destination Domains
          </CardTitle>
          <CardDescription>By aggregated bytes from current event window</CardDescription>
        </CardHeader>
        <CardContent>
          {topDomains.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No domain data"
              description="No NAT events yet — top domains will appear here once traffic flows."
              size="sm"
            />
          ) : (
            <div className="space-y-2">
              {topDomains.map(([domain, bytes]) => (
                <div key={domain} className="flex items-center gap-3">
                  <div className="w-40 text-xs font-mono truncate shrink-0">{domain}</div>
                  <div className="flex-1 h-5 bg-muted/60 dark:bg-muted/30 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/70"
                      style={{ width: `${Math.max(2, (bytes / maxBytes) * 100)}%` }}
                    />
                  </div>
                  <div className="w-20 text-xs text-muted-foreground text-right">
                    {formatBytes(bytes)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-600" />
              Recent NAT Events
              <Badge variant="secondary" className="ml-1">
                {filteredEvents.length}
              </Badge>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => eventsQ.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Filter by dst domain or subscriber IP"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {eventsQ.error ? (
            <ServiceUnavailable
              message={(eventsQ.error as Error).message + " — nat-logger (port 3016) may not be running yet."}
              onRetry={() => eventsQ.refetch()}
            />
          ) : eventsQ.isLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No NAT events"
              description="nat-logger is running but no events have been ingested yet. The VPP adapter will post events when NAT translation occurs."
              size="sm"
              action={{
                label: "Refresh",
                onClick: () => eventsQ.refetch(),
                icon: RefreshCw,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-[480px] overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Subscriber IP</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Proto</TableHead>
                    <TableHead>Ports</TableHead>
                    <TableHead>Bytes</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.slice(0, 200).map((e, i) => {
                    const bytes = (e.bytesSent || 0) + (e.bytesReceived || 0);
                    const natAct = e.natAction || e.action;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(e.timestamp || e.createdAt)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {e.subscriberIp || e.subscriberIpAddr || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {e.dstDomain || e.destinationDomain || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{e.dstCountry || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{e.protocol || "?"}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {e.srcPort || "?"} → {e.dstPort || "?"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatBytes(bytes)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              (natAct || "").toUpperCase().includes("DENY") ||
                              (natAct || "").toUpperCase().includes("DROP")
                                ? "bg-red-100 text-red-800 border-red-200"
                                : "bg-emerald-100 text-emerald-800 border-emerald-200"
                            }
                          >
                            {natAct || "TRANSLATE"}
                          </Badge>
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 5: DPI CLASSIFICATIONS
// ─────────────────────────────────────────────────────────────────
function DpiTab() {
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [appFilter, setAppFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const dpiQ = useQuery({
    queryKey: ["vpp-dpi", riskFilter, appFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (riskFilter !== "ALL") params.set("riskLevel", riskFilter);
      if (appFilter) params.set("appName", appFilter);
      if (categoryFilter) params.set("appCategory", categoryFilter);
      const res = await fetch(`/api/vpp?action=dpi-classifications&${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10000,
    retry: 1,
  });

  const classifications: AnyRecord[] =
    dpiQ.data?.classifications || dpiQ.data?.items || dpiQ.data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CpuIcon className="h-5 w-5 text-emerald-600" />
          DPI Classifications
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Application classification from nDPI / DPI engine — auto-refresh every 10s (§35).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CpuIcon className="h-4 w-4 text-slate-600" />
              Classifications ({classifications.length})
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dpiQ.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <Label className="mb-1.5 block">Risk Level</Label>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="LOW">LOW</SelectItem>
                  <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                  <SelectItem value="HIGH">HIGH</SelectItem>
                  <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">App Name</Label>
              <Input
                placeholder="e.g. YouTube"
                value={appFilter}
                onChange={(e) => setAppFilter(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Category</Label>
              <Input
                placeholder="e.g. Streaming"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              />
            </div>
          </div>

          {dpiQ.error ? (
            <ServiceUnavailable
              message={(dpiQ.error as Error).message + " — DPI engine may not be running yet."}
              onRetry={() => dpiQ.refetch()}
            />
          ) : dpiQ.isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : classifications.length === 0 ? (
            <EmptyState
              icon={CpuIcon}
              title="No DPI classifications"
              description="Classifications will appear when nDPI is integrated with VPP and traffic flows."
              size="sm"
              action={{
                label: "Refresh",
                onClick: () => dpiQ.refetch(),
                icon: RefreshCw,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-[480px] overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Detected At</TableHead>
                    <TableHead>Subscriber IP</TableHead>
                    <TableHead>Subscriber ID</TableHead>
                    <TableHead>App Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Bytes In/Out</TableHead>
                    <TableHead>Flows</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classifications.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(c.detectedAt || c.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.subscriberIp || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {truncate(c.subscriberId, 12)}
                      </TableCell>
                      <TableCell className="font-medium">{c.appName || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{c.appCategory || "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.protocol || "?"}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatBytes(c.bytesIn)} / {formatBytes(c.bytesOut)}
                      </TableCell>
                      <TableCell>{c.flows ?? 0}</TableCell>
                      <TableCell>{riskBadge(c.riskLevel)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 6: DUPLICATE LOGIN POLICY
// ─────────────────────────────────────────────────────────────────
function DuplicateLoginTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const policiesQ = useQuery({
    queryKey: ["vpp-duplicate-login-policy"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=duplicate-login-policy");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const policies: AnyRecord[] =
    policiesQ.data?.policies || policiesQ.data?.items || policiesQ.data?.data || (Array.isArray(policiesQ.data) ? policiesQ.data : []);

  const createMut = useMutation({
    mutationFn: async (payload: AnyRecord) => {
      const res = await fetch("/api/vpp?action=duplicate-login-policy-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Duplicate login policy created");
      queryClient.invalidateQueries({ queryKey: ["vpp-duplicate-login-policy"] });
      setShowForm(false);
    },
    onError: (err: Error) => toast.error(err.message || "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: AnyRecord }) => {
      const res = await fetch(`/api/vpp?action=duplicate-login-policy-update&id=${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Policy updated");
      queryClient.invalidateQueries({ queryKey: ["vpp-duplicate-login-policy"] });
    },
    onError: (err: Error) => toast.error(err.message || "Update failed"),
  });

  const toggleEnabled = (p: AnyRecord) => {
    const id = String(p.id || p._id || p.name);
    if (!id) return;
    updateMut.mutate({
      id,
      payload: { ...p, isEnabled: !(p.isEnabled ?? true) },
    });
  };

  // ─── Create form state ───
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState("DENY_NEW");
  const [maxSessions, setMaxSessions] = useState("1");
  const [scope, setScope] = useState("USERNAME");
  const [isEnabled, setIsEnabled] = useState(true);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    createMut.mutate({
      name,
      description,
      mode,
      maxSessions: parseInt(maxSessions, 10) || 1,
      scope,
      isEnabled,
    });
    setName("");
    setDescription("");
    setMaxSessions("1");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" />
          Duplicate Login Policy
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure simultaneous-session handling: ALLOW_MULTIPLE, DENY_NEW,
          DISCONNECT_OLD, or LIMIT_N (§38).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-slate-600" />
            Policies
            <Badge variant="secondary" className="ml-2">{policies.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Button
              size="sm"
              variant={showForm ? "secondary" : "default"}
              onClick={() => setShowForm(!showForm)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {showForm ? "Cancel" : "New Policy"}
            </Button>
          </div>

          {showForm && (
            <div className="space-y-3 rounded-md border bg-muted/30 dark:bg-muted/20 p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ONE_SESSION_PER_USER" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALLOW_MULTIPLE">ALLOW_MULTIPLE</SelectItem>
                      <SelectItem value="DENY_NEW">DENY_NEW</SelectItem>
                      <SelectItem value="DISCONNECT_OLD">DISCONNECT_OLD</SelectItem>
                      <SelectItem value="LIMIT_N">LIMIT_N</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Scope</Label>
                  <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USERNAME">USERNAME</SelectItem>
                      <SelectItem value="MAC">MAC</SelectItem>
                      <SelectItem value="BOTH">BOTH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Max Sessions</Label>
                  <Input type="number" value={maxSessions} onChange={(e) => setMaxSessions(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => setIsEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Enabled
                  </Label>
                </div>
              </div>
              <Button size="sm" onClick={submit} disabled={createMut.isPending}>
                <Plus className="h-4 w-4 mr-1.5" />
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          )}

          {policiesQ.error ? (
            <ServiceUnavailable
              message={(policiesQ.error as Error).message}
              onRetry={() => policiesQ.refetch()}
            />
          ) : policiesQ.isLoading ? (
            <TableSkeleton rows={3} cols={6} />
          ) : policies.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No duplicate login policies"
              description="Create a policy to control how simultaneous logins are handled."
              size="sm"
              action={{
                label: "Create",
                onClick: () => setShowForm(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Max Sessions</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((p, i) => {
                    const id = String(p.id || p._id || p.name || i);
                    const isEnabled = p.isEnabled ?? p.enabled ?? true;
                    const mode = p.mode || "DENY_NEW";
                    const modeBadgeClass =
                      mode === "ALLOW_MULTIPLE"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : mode === "DENY_NEW"
                        ? "bg-red-100 text-red-800 border-red-200"
                        : mode === "DISCONNECT_OLD"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : "bg-slate-100 text-slate-700 border-slate-200";
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={modeBadgeClass}>
                            {mode}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{p.maxSessions ?? 1}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{p.scope || "USERNAME"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={
                              isEnabled
                                ? "text-emerald-700 hover:bg-emerald-50"
                                : "text-slate-500 hover:bg-slate-50"
                            }
                            onClick={() => toggleEnabled(p)}
                            disabled={updateMut.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            {isEnabled ? "Enabled" : "Disabled"}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (!window.confirm(`Delete policy '${p.name}'?`)) return;
                              updateMut.mutate({ id, payload: { ...p, isEnabled: false } });
                              // Note: actual delete endpoint could be added via DELETE
                              toast.success("Policy disabled (use backend DELETE for permanent removal)");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function VPPGatewayPage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="h-6 w-6 text-emerald-600" />
            VPP Gateway
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            VPP v26.06 + DPDK dataplane — policy objects, session snapshots,
            NAT events, DPI, and duplicate-login policy.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start">
          <TabsTrigger value="overview">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="policy">
            <Shield className="h-4 w-4" />
            Policy Objects
          </TabsTrigger>
          <TabsTrigger value="snapshots">
            <Database className="h-4 w-4" />
            Session Snapshots
          </TabsTrigger>
          <TabsTrigger value="nat">
            <Network className="h-4 w-4" />
            NAT Events
          </TabsTrigger>
          <TabsTrigger value="dpi">
            <Cpu className="h-4 w-4" />
            DPI
          </TabsTrigger>
          <TabsTrigger value="dup-login">
            <Users className="h-4 w-4" />
            Duplicate Login
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="policy" className="mt-6">
          <PolicyObjectsTab />
        </TabsContent>
        <TabsContent value="snapshots" className="mt-6">
          <SnapshotsTab />
        </TabsContent>
        <TabsContent value="nat" className="mt-6">
          <NatEventsTab />
        </TabsContent>
        <TabsContent value="dpi" className="mt-6">
          <DpiTab />
        </TabsContent>
        <TabsContent value="dup-login" className="mt-6">
          <DuplicateLoginTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
