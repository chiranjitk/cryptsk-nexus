"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity, AlertOctagon, AlertTriangle, ArrowUpDown, BarChart3, CheckCheck, CheckCircle2,
  Clock, Database, Gauge, Globe, Inbox, Info, Loader2, Network, Play, Radio, RefreshCw,
  ScrollText, Search, Server, ShieldAlert, Stethoscope, Wifi,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { humanBytes, formatNumber, relTime } from "@/lib/format";

// ============================================================
// CRYPTSK Nexus — Monitoring & Diagnostics Panel (Menu #10)
// Tabs: Overview · Bandwidth · Traffic · Alerts · Diagnostics · Syslog
// 100% real data via /api/monitoring/* (overview, bandwidth, traffic,
// alerts, diagnostics, probes, syslog). No mock data.
// ============================================================

type Tab = "overview" | "bandwidth" | "traffic" | "alerts" | "diagnostics" | "syslog";

// ---------- API contract types ----------

type ServiceStatus = "up" | "down" | "degraded";
type AlertSeverity = "critical" | "warning" | "info";

interface ServiceHealth {
  key: string;
  label: string;
  status: ServiceStatus;
  latencyMs: number | null;
  detail: string;
}

interface OverviewData {
  dbLatencyMs: number;
  services: ServiceHealth[];
  nas: { total: number; up: number; down: number };
  sessions: { active: number; today: number };
  auth: { accepts24h: number; rejects24h: number; rejectRatePct: number };
  traffic: { inBytes: number; outBytes: number };
  syslog: { last24h: number; errOrWorse1h: number; lastAt: string | null };
  alerts: { critical: number; warning: number; info: number; active: number };
}

interface BandwidthPoint { hour: string; inBytes: number; outBytes: number; sessions: number }
interface NasBandwidth { nasId: string; nasName: string; inBytes: number; outBytes: number; sessions: number }
interface PlanBandwidth { planId: string; planName: string; inBytes: number; outBytes: number }
interface BandwidthData {
  series: BandwidthPoint[];
  perNas: NasBandwidth[];
  perPlan: PlanBandwidth[];
  totals: { inBytes: number; outBytes: number; sessions: number };
}

interface Talker {
  username: string;
  displayName: string;
  planName?: string;
  inBytes: number;
  outBytes: number;
  totalBytes: number;
  sessions: number;
  lastSeen: string;
}
interface TrafficData {
  topTalkers: Talker[];
  totals: { inBytes: number; outBytes: number; sessions: number; distinctUsers: number };
}

interface MonitorAlert {
  id: string;
  alertKey: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  source: string;
  isAcknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}
interface AlertsData {
  alerts: MonitorAlert[];
  counts: { critical: number; warning: number; info: number; active: number };
}

interface Probe {
  id: string;
  service: string;
  status: string;
  latencyMs: number | null;
  detail: string;
  checkedAt: string;
}

interface DiagResult {
  tool: string;
  target: string;
  ok: boolean;
  latencyMs: number | null;
  result?: unknown;
  error?: string;
  checkedAt: string;
}

interface SyslogEntry {
  id: string;
  facility: string;
  severity: number;
  severityLabel: string;
  tag: string;
  host: string;
  sourceIp: string;
  message: string;
  receivedAt: string;
}
interface SyslogData {
  entries: SyslogEntry[];
  counts: { emerg: number; alert: number; crit: number; err: number; warning: number; notice: number; info: number; debug: number };
  total: number;
}

// ---------- style maps (network-panel palette: emerald/red/amber/violet/slate) ----------

const SERVICE_STATUS_STYLES: Record<string, { dot: string; badge: string; label: string }> = {
  up: { dot: "bg-emerald-500 animate-pulse", badge: "border-emerald-500/30 text-emerald-600", label: "Up" },
  degraded: { dot: "bg-amber-500", badge: "border-amber-500/30 text-amber-600", label: "Degraded" },
  down: { dot: "bg-red-500", badge: "border-red-500/30 text-red-600", label: "Down" },
};

const ALERT_SEVERITY_STYLES: Record<AlertSeverity, { badge: string; circle: string; iconClass: string; icon: typeof AlertOctagon }> = {
  critical: { badge: "border-red-500/30 text-red-600", circle: "bg-red-500/10", iconClass: "text-red-500 animate-pulse", icon: AlertOctagon },
  warning: { badge: "border-amber-500/30 text-amber-600", circle: "bg-amber-500/10", iconClass: "text-amber-500", icon: AlertTriangle },
  info: { badge: "border-slate-400/30 text-slate-500", circle: "bg-slate-500/10", iconClass: "text-slate-500", icon: Info },
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

// Syslog severity (RFC 5424): 0-2 red, 3-4 amber, 5-6 slate, 7 muted
const SYSLOG_SEVERITY_STYLES: Record<number, string> = {
  0: "border-red-500/40 text-red-600",
  1: "border-red-500/40 text-red-600",
  2: "border-red-500/30 text-red-600",
  3: "border-amber-500/40 text-amber-600",
  4: "border-amber-500/30 text-amber-600",
  5: "border-slate-400/40 text-slate-600",
  6: "border-slate-400/30 text-slate-500",
  7: "border-border text-muted-foreground",
};

const SYSLOG_SEVERITY_LABELS: Record<number, string> = {
  0: "emerg", 1: "alert", 2: "crit", 3: "err", 4: "warning", 5: "notice", 6: "info", 7: "debug",
};

// ---------- shared helpers (same patterns as network-panel) ----------

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// BigInt values can arrive JSON-serialized as strings — coerce defensively.
function num(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function useDebounced(value: string, delay = 350) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function StatChip({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className={`rounded-md border bg-card px-3 py-2 ${className || ""}`}>
      <div className="text-lg font-semibold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

// StatusFilterBar-style pill group without count badges (time windows)
function WindowPills({ options, value, onChange, ariaLabel }: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            value === o.id ? "border-primary bg-primary text-primary-foreground" : "border-transparent hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10" role="alert">
      <AlertTriangle className="size-8 text-amber-500" />
      <p className="text-sm font-medium">Failed to load</p>
      <p className="text-xs text-muted-foreground">{message || "The request failed. Check your connection and try again."}</p>
      <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={onRetry}>
        <RefreshCw className="size-3.5" /> Retry
      </Button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint, action }: {
  icon: typeof Inbox; title: string; hint: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-center text-xs text-muted-foreground">{hint}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// Native select styled to match the platform
function StyledSelect({ value, onChange, children, ariaLabel, disabled, className }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
  ariaLabel: string; disabled?: boolean; className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
    >
      {children}
    </select>
  );
}

// Static icon registry (looked up by key — never created during render)
const SERVICE_ICON_MAP: Record<string, typeof Activity> = {
  postgres: Database, database: Database, db: Database,
  radius: Radio, freeradius: Radio, auth: Radio,
  vpp: Gauge, dataplane: Gauge, gateway: Gauge,
  syslog: ScrollText, rsyslog: ScrollText, logs: ScrollText,
  web: Globe, http: Globe, portal: Globe, api: Globe, app: Globe,
  nas: Server, ssh: Server,
  sessions: Wifi, session_engine: Wifi,
  dhcp: Network, dns: Network, network: Network,
};
const SERVICE_ICON_DEFAULT = Activity;

function serviceIconKey(key: string, label: string): string {
  const k = (key || "").toLowerCase();
  if (SERVICE_ICON_MAP[k]) return k;
  if (/postgres|database/.test(k)) return "postgres";
  if (/radius|auth/.test(k)) return "radius";
  if (/vpp|dataplane|gateway/.test(k)) return "vpp";
  if (/syslog|log/.test(k)) return "syslog";
  if (/web|http|portal|api|app/.test(k)) return "web";
  if (/nas|ssh|device/.test(k)) return "nas";
  if (/session/.test(k)) return "sessions";
  if (/dhcp|dns|network/.test(k)) return "network";
  const l = (label || "").toLowerCase();
  if (/postgres|database/.test(l)) return "postgres";
  if (/radius|auth/.test(l)) return "radius";
  if (/vpp|dataplane|gateway/.test(l)) return "vpp";
  if (/syslog|log/.test(l)) return "syslog";
  return "default";
}

function isDbService(s: ServiceHealth): boolean {
  return /postgres|database|^db$/i.test(s.key) || /postgres/i.test(s.label);
}

// ============================================================
// Panel root
// ============================================================

export function MonitoringPanel() {
  const [tab, setTab] = React.useState<Tab>("overview");

  const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "bandwidth", label: "Bandwidth", icon: BarChart3 },
    { id: "traffic", label: "Traffic", icon: ArrowUpDown },
    { id: "alerts", label: "Alerts", icon: AlertTriangle },
    { id: "diagnostics", label: "Diagnostics", icon: Stethoscope },
    { id: "syslog", label: "Syslog", icon: ScrollText },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Monitoring &amp; Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Live platform observability — services, traffic, alerts &amp; diagnostics
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "bandwidth" && <BandwidthTab />}
      {tab === "traffic" && <TrafficTab />}
      {tab === "alerts" && <AlertsTab />}
      {tab === "diagnostics" && <DiagnosticsTab />}
      {tab === "syslog" && <SyslogTab />}
    </div>
  );
}

// ============================================================
// Tab 1 — Overview
// ============================================================

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-md" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
      </div>
    </div>
  );
}

function OverviewTab() {
  const overviewQ = useQuery<OverviewData>({
    queryKey: ["monitoring", "overview"],
    queryFn: () => apiRequest("/api/monitoring/overview"),
    refetchInterval: 30000,
  });
  const probesQ = useQuery<Probe[]>({
    queryKey: ["monitoring", "probes"],
    queryFn: async () => {
      const d = await apiRequest("/api/monitoring/probes?hours=24") as { probes?: Probe[] };
      return d.probes || [];
    },
    refetchInterval: 30000,
  });

  if (overviewQ.isLoading || probesQ.isLoading) return <OverviewSkeleton />;
  if (overviewQ.isError) {
    return <ErrorState onRetry={() => { overviewQ.refetch(); probesQ.refetch(); }} message="Could not load the monitoring overview." />;
  }
  if (!overviewQ.data) return null;

  const o = overviewQ.data;
  const sortedProbes = [...probesQ.data || []].sort(
    (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
  );
  const rejectRate = num(o.auth.rejectRatePct);
  const trafficToday = num(o.traffic.inBytes) + num(o.traffic.outBytes);

  return (
    <div className="space-y-4">
      {/* Service health cards */}
      {o.services.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Activity}
              title="No services monitored yet"
              hint="Service health checks appear here once the monitoring engine registers platform services."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {o.services.map((s, idx) => (
            <ServiceCard key={`${s.key}-${idx}`} service={s} dbLatencyMs={o.dbLatencyMs} probes={sortedProbes} />
          ))}
        </div>
      )}

      {/* Platform stat chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatChip label="NAS up" value={`${num(o.nas.up)}/${num(o.nas.total)}`} />
        <StatChip label="Active sessions" value={formatNumber(num(o.sessions.active))} />
        <StatChip
          label="Auth reject rate 24h"
          value={`${rejectRate}%`}
          className={rejectRate > 10 ? "border-red-500/40 bg-red-500/5 text-red-600" : ""}
        />
        <StatChip label="Traffic today" value={humanBytes(trafficToday)} />
        <StatChip
          label="Syslog 24h"
          value={formatNumber(num(o.syslog.last24h))}
          className={num(o.syslog.errOrWorse1h) > 0 ? "border-amber-500/40 bg-amber-500/5" : ""}
        />
        <StatChip
          label="Active alerts"
          value={formatNumber(num(o.alerts.active))}
          className={num(o.alerts.critical) > 0 ? "border-red-500/40 bg-red-500/5 text-red-600" : ""}
        />
      </div>
    </div>
  );
}

function ServiceCard({ service, dbLatencyMs, probes }: {
  service: ServiceHealth;
  dbLatencyMs: number;
  probes: Probe[];
}) {
  const st = SERVICE_STATUS_STYLES[service.status] || SERVICE_STATUS_STYLES.down;
  const Icon = SERVICE_ICON_MAP[serviceIconKey(service.key, service.label)] || SERVICE_ICON_DEFAULT;
  // A down service's latencyMs is just time-to-fail — never present it as latency.
  const isDown = service.status === "down";
  const latencyText = isDown
    ? "DOWN"
    : isDbService(service) && dbLatencyMs != null
      ? `${num(dbLatencyMs)} ms`
      : service.latencyMs != null ? `${num(service.latencyMs)} ms` : "—";
  const recent = probes.filter((p) => p.service === service.key).slice(0, 3);

  return (
    <Card className="cryptsk-card-load">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${st.dot}`} aria-hidden="true" />
            <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-sm font-medium" title={service.label}>{service.label}</span>
          </div>
          <Badge variant="outline" className={`shrink-0 text-[10px] tabular-nums ${st.badge}`}>{latencyText}</Badge>
        </div>
        <p className="line-clamp-2 min-h-[2rem] text-xs text-muted-foreground" title={service.detail}>
          {service.detail || st.label}
        </p>
        {recent.length > 0 && (
          <div className="space-y-0.5 border-t pt-2" aria-label={`Recent probes for ${service.label}`}>
            {recent.map((p) => {
              const ok = /ok|up|pass|success|healthy/i.test(p.status);
              return (
                <div key={p.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={`size-1.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden="true" />
                  <span className="tabular-nums">{ok ? (p.latencyMs != null ? `${num(p.latencyMs)} ms` : "—") : "failed"}</span>
                  <span className="ml-auto" title={new Date(p.checkedAt).toLocaleString()}>{relTime(p.checkedAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab 2 — Bandwidth
// ============================================================

function BandwidthTab() {
  const [hours, setHours] = React.useState("24");
  const q = useQuery<BandwidthData>({
    queryKey: ["monitoring", "bandwidth", hours],
    queryFn: () => apiRequest(`/api/monitoring/bandwidth?hours=${hours}`),
    refetchInterval: 60000,
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>
        <Skeleton className="h-72 w-full rounded-md" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      </div>
    );
  }
  if (q.isError) return <Card><CardContent className="p-0"><ErrorState onRetry={() => q.refetch()} message="Could not load bandwidth data." /></CardContent></Card>;
  if (!q.data) return null;

  const d = q.data;
  const series = d.series || [];
  const perNas = d.perNas || [];
  const perPlan = d.perPlan || [];
  const hasTraffic = series.some((p) => num(p.inBytes) > 0 || num(p.outBytes) > 0);

  const maxNasTotal = Math.max(1, ...perNas.map((n) => num(n.inBytes) + num(n.outBytes)));
  const grandPlan = Math.max(1, perPlan.reduce((s, p) => s + num(p.inBytes) + num(p.outBytes), 0));

  const fmtHour = (v: string) => {
    const dt = new Date(v);
    if (isNaN(dt.getTime())) return v;
    return hours === "24"
      ? dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
      : `${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}h`;
  };

  return (
    <div className="space-y-4">
      {/* Window + totals */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 grid-cols-3 gap-3 sm:max-w-md">
          <StatChip label={`In (${hours === "168" ? "7d" : `${hours}h`})`} value={humanBytes(num(d.totals.inBytes))} />
          <StatChip label={`Out (${hours === "168" ? "7d" : `${hours}h`})`} value={humanBytes(num(d.totals.outBytes))} />
          <StatChip label="Sessions" value={formatNumber(num(d.totals.sessions))} />
        </div>
        <WindowPills
          ariaLabel="Bandwidth window"
          value={hours}
          onChange={setHours}
          options={[{ id: "24", label: "24h" }, { id: "72", label: "72h" }, { id: "168", label: "7d" }]}
        />
      </div>

      {/* Traffic chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="size-4 text-primary" /> Traffic Volume ({hours === "168" ? "7 days" : `${hours} hours`})</CardTitle>
          <CardDescription>Aggregated per-hour RADIUS accounting traffic</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasTraffic ? (
            <div className="flex flex-col items-center justify-center gap-3 h-[260px] text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted"><ArrowUpDown className="size-6 text-muted-foreground" /></div>
              <p className="text-sm font-medium">No traffic recorded in this window</p>
              <p className="max-w-sm text-xs text-muted-foreground">Charts populate automatically once RADIUS accounting sessions start flowing.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="monInGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="monOutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="hour" className="text-xs" tickLine={false} axisLine={false} tickFormatter={(v: string) => fmtHour(v)} />
                <YAxis className="text-xs" tickLine={false} axisLine={false} tickFormatter={(v: number) => humanBytes(v)} width={70} />
                <Tooltip formatter={(v) => humanBytes(Number(v))} contentStyle={{ borderRadius: 10 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="inBytes" name="In" stroke="#dc2626" strokeWidth={2} fill="url(#monInGrad)" />
                <Area type="monotone" dataKey="outBytes" name="Out" stroke="#16a34a" strokeWidth={2} fill="url(#monOutGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Per-NAS + per-Plan tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Server className="size-4 text-primary" /> Per NAS Device</CardTitle>
            <CardDescription>Traffic volume by NAS — bar = share vs busiest NAS</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {perNas.length === 0 ? (
              <EmptyState icon={Server} title="No NAS traffic" hint="Per-NAS accounting volume appears once NAS devices report sessions." />
            ) : (
              <div className="max-h-96 overflow-auto cryptsk-scrollbar">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>NAS</TableHead><TableHead>Sessions</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead><TableHead className="w-28">Utilization</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {perNas.map((n) => {
                      const total = num(n.inBytes) + num(n.outBytes);
                      const pct = Math.min(100, (total / maxNasTotal) * 100);
                      return (
                        <TableRow key={n.nasId} className="hover:bg-muted/50">
                          <TableCell className="max-w-[12rem] truncate text-sm font-medium" title={n.nasName}>{n.nasName || n.nasId}</TableCell>
                          <TableCell className="text-sm tabular-nums">{formatNumber(num(n.sessions))}</TableCell>
                          <TableCell className="text-xs tabular-nums">{humanBytes(num(n.inBytes))}</TableCell>
                          <TableCell className="text-xs tabular-nums">{humanBytes(num(n.outBytes))}</TableCell>
                          <TableCell>
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="presentation">
                              <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                            </div>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Gauge className="size-4 text-primary" /> Per Plan</CardTitle>
            <CardDescription>Traffic volume by subscriber plan — bar = share of total</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {perPlan.length === 0 ? (
              <EmptyState icon={Gauge} title="No plan traffic" hint="Per-plan volume appears once subscribers generate accounting traffic." />
            ) : (
              <div className="max-h-96 overflow-auto cryptsk-scrollbar">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Plan</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead><TableHead className="w-28">Share</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {perPlan.map((p) => {
                      const total = num(p.inBytes) + num(p.outBytes);
                      const pct = (total / grandPlan) * 100;
                      return (
                        <TableRow key={p.planId} className="hover:bg-muted/50">
                          <TableCell className="max-w-[12rem] truncate text-sm font-medium" title={p.planName}>{p.planName || p.planId}</TableCell>
                          <TableCell className="text-xs tabular-nums">{humanBytes(num(p.inBytes))}</TableCell>
                          <TableCell className="text-xs tabular-nums">{humanBytes(num(p.outBytes))}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" role="presentation">
                                <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <span className="text-[10px] tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>
                            </div>
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
    </div>
  );
}

// ============================================================
// Tab 3 — Traffic (top talkers)
// ============================================================

function TrafficTab() {
  const [hours, setHours] = React.useState("168");
  const q = useQuery<TrafficData>({
    queryKey: ["monitoring", "traffic", hours],
    queryFn: () => apiRequest(`/api/monitoring/traffic?limit=10&hours=${hours}`),
    refetchInterval: 60000,
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>
        <Skeleton className="h-72 w-full rounded-md" />
      </div>
    );
  }
  if (q.isError) return <Card><CardContent className="p-0"><ErrorState onRetry={() => q.refetch()} message="Could not load traffic data." /></CardContent></Card>;
  if (!q.data) return null;

  const talkers = q.data.topTalkers || [];
  const totals = q.data.totals;
  const maxTotal = Math.max(1, ...talkers.map((t) => num(t.totalBytes)));

  return (
    <div className="space-y-4">
      {/* Totals + window */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 grid-cols-3 gap-3 sm:max-w-lg">
          <StatChip label={`Total traffic (${hours === "168" ? "7d" : "24h"})`} value={humanBytes(num(totals.inBytes) + num(totals.outBytes))} />
          <StatChip label="Sessions" value={formatNumber(num(totals.sessions))} />
          <StatChip label="Distinct users" value={formatNumber(num(totals.distinctUsers))} />
        </div>
        <WindowPills
          ariaLabel="Traffic window"
          value={hours}
          onChange={setHours}
          options={[{ id: "24", label: "24h" }, { id: "168", label: "7d" }]}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ArrowUpDown className="size-4 text-primary" /> Top Talkers</CardTitle>
          <CardDescription>Highest-traffic subscribers in the selected window</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {talkers.length === 0 ? (
            <EmptyState
              icon={ArrowUpDown}
              title="No sessions in this window"
              hint="Top talkers appear here once RADIUS accounting records subscriber traffic."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="w-28">Share</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {talkers.map((t, idx) => {
                    const share = Math.min(100, (num(t.totalBytes) / maxTotal) * 100);
                    return (
                      <TableRow key={t.username} className="hover:bg-muted/50">
                        <TableCell className="text-xs font-semibold tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-xs font-mono font-medium" title={t.username}>{t.username}</TableCell>
                        <TableCell className="max-w-[10rem] truncate text-sm" title={t.displayName}>{t.displayName || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.planName || "—"}</TableCell>
                        <TableCell className="text-sm tabular-nums">{formatNumber(num(t.sessions))}</TableCell>
                        <TableCell className="text-xs tabular-nums">{humanBytes(num(t.inBytes))}</TableCell>
                        <TableCell className="text-xs tabular-nums">{humanBytes(num(t.outBytes))}</TableCell>
                        <TableCell className="text-xs font-semibold tabular-nums">{humanBytes(num(t.totalBytes))}</TableCell>
                        <TableCell>
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="presentation">
                            <div className="h-full rounded-full bg-violet-500/70" style={{ width: `${share}%` }} />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" title={new Date(t.lastSeen).toLocaleString()}>{relTime(t.lastSeen)}</TableCell>
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

// ============================================================
// Tab 4 — Alerts
// ============================================================

function AlertRow({ a, onAck, pending }: { a: MonitorAlert; onAck: (v: boolean) => void; pending: boolean }) {
  const sev = ALERT_SEVERITY_STYLES[a.severity] || ALERT_SEVERITY_STYLES.info;
  const Icon = sev.icon;
  return (
    <div className="flex items-start gap-3 p-4">
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${sev.circle}`} aria-hidden="true">
        <Icon className={`size-4 ${sev.iconClass}`} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{a.title}</p>
          <Badge variant="outline" className={`text-[10px] capitalize ${sev.badge}`}>{a.severity}</Badge>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">{a.source}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{a.detail}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" /> first {relTime(a.firstSeenAt)}
          </span>
          <span>last {relTime(a.lastSeenAt)}</span>
          {a.isAcknowledged && (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[10px] text-emerald-600">
              <CheckCheck className="size-3" aria-hidden="true" />
              Acknowledged{a.acknowledgedBy ? ` · ${a.acknowledgedBy}` : ""}
            </Badge>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" disabled={pending} onClick={() => onAck(!a.isAcknowledged)}>
        {a.isAcknowledged ? "Unacknowledge" : "Acknowledge"}
      </Button>
    </div>
  );
}

function AlertsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sev, setSev] = React.useState("all");

  const q = useQuery<AlertsData>({
    queryKey: ["monitoring", "alerts"],
    queryFn: () => apiRequest("/api/monitoring/alerts"),
    refetchInterval: 30000,
  });

  const ackMutation = useMutation({
    mutationFn: ({ id, isAcknowledged }: { id: string; isAcknowledged: boolean }) =>
      apiRequest(`/api/monitoring/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAcknowledged }),
      }),
    onSuccess: (_d, vars) => {
      toast({ title: vars.isAcknowledged ? "Alert acknowledged" : "Alert unacknowledged" });
      qc.invalidateQueries({ queryKey: ["monitoring", "alerts"] });
      qc.invalidateQueries({ queryKey: ["monitoring", "overview"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (q.isLoading) {
    return (
      <Card>
        <div className="space-y-2 p-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </Card>
    );
  }
  if (q.isError) return <Card><CardContent className="p-0"><ErrorState onRetry={() => q.refetch()} message="Could not load alerts." /></CardContent></Card>;
  if (!q.data) return null;

  const counts = q.data.counts || { critical: 0, warning: 0, info: 0, active: 0 };
  const alerts = q.data.alerts || [];
  const filtered = alerts.filter((a) => sev === "all" || a.severity === sev);
  const sorted = [...filtered].sort((a, b) => {
    if (a.isAcknowledged !== b.isAcknowledged) return a.isAcknowledged ? 1 : -1;
    const r = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
    if (r !== 0) return r;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  const pills: { id: string; label: string; count: number; tone: string }[] = [
    { id: "all", label: "All", count: alerts.length, tone: "" },
    { id: "critical", label: "Critical", count: num(counts.critical), tone: "text-red-600 border-red-500/30 bg-red-500/5" },
    { id: "warning", label: "Warning", count: num(counts.warning), tone: "text-amber-600" },
    { id: "info", label: "Info", count: num(counts.info), tone: "text-slate-500" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-primary" /> Alert Center</CardTitle>
            <CardDescription>Platform alerts raised by monitoring rules — acknowledge to mute noise</CardDescription>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Severity filter">
            {pills.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={sev === p.id}
                onClick={() => setSev(p.id)}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  sev === p.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : `border-transparent hover:bg-muted ${p.tone}`
                }`}
              >
                {p.label}
                <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${sev === p.id ? "bg-primary-foreground/20" : "bg-muted"}`}>{p.count}</span>
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {num(counts.active) === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-emerald-600">All clear — no active alerts</p>
            <p className="max-w-sm text-center text-xs text-muted-foreground">
              Monitoring rules are satisfied across services, NAS devices and syslog.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={AlertTriangle} title={`No ${sev} alerts`} hint="No alerts match this severity filter right now." />
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((a) => (
              <AlertRow
                key={a.id}
                a={a}
                pending={ackMutation.isPending && ackMutation.variables?.id === a.id}
                onAck={(v) => ackMutation.mutate({ id: a.id, isAcknowledged: v })}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab 5 — Diagnostics
// ============================================================

function extractString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function extractNumber(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (typeof rec[k] === "number") return rec[k] as number;
    if (typeof rec[k] === "string" && rec[k] !== "" && isFinite(Number(rec[k]))) return Number(rec[k]);
  }
  return null;
}

function extractStringArray(obj: unknown, keys: string[]): string[] {
  if (Array.isArray(obj)) return obj.map(String);
  if (!obj || typeof obj !== "object") return [];
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string" && v) return v.split(/\s*,\s*/).filter(Boolean);
  }
  return [];
}

function renderDiagResult(res: DiagResult): React.ReactNode {
  const r = res.result;
  if (res.tool === "dns") {
    const records = extractStringArray(r, ["addresses", "records", "answers", "results"]);
    if (records.length > 0) {
      return (
        <ul className="space-y-1">
          {records.map((rec, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs font-mono" title={rec}>
              <Globe className="size-3 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="truncate">{rec}</span>
            </li>
          ))}
        </ul>
      );
    }
  } else if (res.tool === "tcp") {
    const remote = extractString(r, ["remote", "remoteAddress", "address", "ip", "endpoint"]);
    if (remote) {
      return (
        <p className="flex items-center gap-1.5 text-xs">
          <Server className="size-3 shrink-0 text-emerald-600" aria-hidden="true" />
          Connected to <span className="font-mono">{remote}</span>
        </p>
      );
    }
  } else if (res.tool === "http") {
    const status = extractNumber(r, ["status", "statusCode", "code"]);
    const server = extractString(r, ["server", "serverHeader", "contentType", "content_type"]);
    if (status != null || server) {
      return (
        <div className="space-y-1 text-xs">
          {status != null && <p>HTTP status <span className="font-mono font-semibold">{status}</span></p>}
          {server && <p className="text-muted-foreground">server: <span className="font-mono">{server}</span></p>}
        </div>
      );
    }
  }
  if (typeof r === "string" && r) return <p className="text-xs font-mono break-all">{r}</p>;
  if (r != null && typeof r === "object") {
    return <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">{JSON.stringify(r, null, 2)}</pre>;
  }
  return null;
}

function DiagResultBlock({ res }: { res: DiagResult }) {
  return (
    <div
      className={`space-y-2 rounded-md border p-3 ${res.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`text-[10px] ${res.ok ? "border-emerald-500/30 text-emerald-600" : "border-red-500/30 text-red-600"}`}>
          {res.ok ? "OK" : "Failed"}
        </Badge>
        <span className="max-w-[10rem] truncate text-xs font-mono" title={res.target}>{res.target}</span>
        {res.ok && res.latencyMs != null && (
          <Badge variant="outline" className="text-[10px] tabular-nums border-emerald-500/30 text-emerald-600">{num(res.latencyMs)} ms</Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground" title={new Date(res.checkedAt).toLocaleString()}>{relTime(res.checkedAt)}</span>
      </div>
      {!res.ok && res.error && <p className="text-xs text-red-600">{res.error}</p>}
      {res.ok && renderDiagResult(res)}
    </div>
  );
}

function useDiagProbe() {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation<DiagResult, Error, Record<string, unknown>>({
    mutationFn: (body) =>
      apiRequest("/api/monitoring/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      toast({
        title: res.ok ? "Probe completed" : "Probe failed",
        description: res.ok ? `${res.latencyMs != null ? num(res.latencyMs) : "—"} ms` : res.error || undefined,
        variant: res.ok ? "default" : "destructive",
      });
      qc.invalidateQueries({ queryKey: ["monitoring", "probes"] });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
}

function RunButton({ pending, disabled, label }: { pending: boolean; disabled: boolean; label: string }) {
  return (
    <Button type="submit" className="w-full gap-2" disabled={pending || disabled} aria-label={`Run ${label}`}>
      {pending
        ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        : <Play className="size-3.5" aria-hidden="true" />}
      {pending ? "Running…" : "Run"}
    </Button>
  );
}

function DnsToolCard() {
  const [target, setTarget] = React.useState("");
  const [recordType, setRecordType] = React.useState("A");
  const run = useDiagProbe();
  const valid = target.trim().length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Globe className="size-4 text-primary" /> DNS Lookup</CardTitle>
        <CardDescription>Resolve A / AAAA / MX / TXT records</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); if (valid) run.mutate({ tool: "dns", target: target.trim(), recordType }); }} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="diag-dns-target" className="text-xs">Hostname or IP</Label>
            <Input id="diag-dns-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="one.one.one.one" className="h-9 font-mono" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Record type</Label>
            <StyledSelect value={recordType} onChange={setRecordType} ariaLabel="DNS record type" className="w-full">
              {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR"].map((rt) => <option key={rt} value={rt}>{rt}</option>)}
            </StyledSelect>
          </div>
          <RunButton pending={run.isPending} disabled={!valid} label="DNS lookup" />
        </form>
        {run.data && <DiagResultBlock res={run.data} />}
      </CardContent>
    </Card>
  );
}

function TcpToolCard() {
  const [target, setTarget] = React.useState("");
  const [port, setPort] = React.useState("");
  const run = useDiagProbe();
  const portNum = Number(port);
  const valid = target.trim().length > 0 && port.trim() !== "" && Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Server className="size-4 text-primary" /> TCP Port Check</CardTitle>
        <CardDescription>Verify a TCP port is reachable</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); if (valid) run.mutate({ tool: "tcp", target: target.trim(), port: portNum }); }} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="diag-tcp-target" className="text-xs">Host or IP</Label>
            <Input id="diag-tcp-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="nas1.isp.internal" className="h-9 font-mono" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="diag-tcp-port" className="text-xs">Port</Label>
            <Input
              id="diag-tcp-port" type="number" min={1} max={65535} value={port}
              onChange={(e) => setPort(e.target.value)} placeholder="443" className="h-9 font-mono"
            />
          </div>
          <RunButton pending={run.isPending} disabled={!valid} label="TCP port check" />
        </form>
        {run.data && <DiagResultBlock res={run.data} />}
      </CardContent>
    </Card>
  );
}

function HttpToolCard() {
  const [target, setTarget] = React.useState("");
  const run = useDiagProbe();
  const valid = target.trim().length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Globe className="size-4 text-primary" /> HTTP Probe</CardTitle>
        <CardDescription>Check status code and server header</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); if (valid) run.mutate({ tool: "http", target: target.trim() }); }} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="diag-http-target" className="text-xs">URL</Label>
            <Input
              id="diag-http-target" value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder="https://status.example.internal/health" className="h-9 font-mono" autoComplete="off"
            />
          </div>
          <RunButton pending={run.isPending} disabled={!valid} label="HTTP probe" />
        </form>
        {run.data && <DiagResultBlock res={run.data} />}
      </CardContent>
    </Card>
  );
}

function RecentProbesCard() {
  const q = useQuery<Probe[]>({
    queryKey: ["monitoring", "probes"],
    queryFn: async () => {
      const d = await apiRequest("/api/monitoring/probes?hours=24") as { probes?: Probe[] };
      return d.probes || [];
    },
    refetchInterval: 30000,
  });

  const probes = [...(q.data || [])].sort(
    (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Stethoscope className="size-4 text-primary" /> Recent Probe Results</CardTitle>
        <CardDescription>Last 24h of diagnostic runs from this panel and automated checks</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <TableSkeleton rows={4} /> : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} message="Could not load probe history." />
        ) : probes.length === 0 ? (
          <EmptyState icon={Stethoscope} title="No probes yet" hint="Run DNS, TCP or HTTP diagnostics above — results appear here." />
        ) : (
          <div className="max-h-96 overflow-auto cryptsk-scrollbar">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Service</TableHead><TableHead>Status</TableHead><TableHead>Latency</TableHead><TableHead>Detail</TableHead><TableHead>Checked</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {probes.map((p) => {
                  const ok = /ok|up|pass|success|healthy/i.test(p.status);
                  const fail = /fail|down|error|timeout|unreach|refus/i.test(p.status);
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/50">
                      <TableCell className="text-xs font-mono font-medium">{p.service}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`gap-1.5 text-[10px] capitalize ${ok ? "border-emerald-500/30 text-emerald-600" : fail ? "border-red-500/30 text-red-600" : "border-slate-400/30 text-slate-500"}`}
                        >
                          <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-500" : fail ? "bg-red-500" : "bg-slate-400"}`} aria-hidden="true" />
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{p.latencyMs != null ? `${num(p.latencyMs)} ms` : "—"}</TableCell>
                      <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground" title={p.detail}>{p.detail || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground" title={new Date(p.checkedAt).toLocaleString()}>{relTime(p.checkedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticsTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <DnsToolCard />
        <TcpToolCard />
        <HttpToolCard />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
        Probes execute from the platform server — use for infrastructure reachability checks.
      </p>
      <RecentProbesCard />
    </div>
  );
}

// ============================================================
// Tab 6 — Syslog
// ============================================================

function SyslogTab() {
  const [severity, setSeverity] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebounced(searchInput, 400);
  const [hours, setHours] = React.useState("168");

  const qs = new URLSearchParams();
  if (severity !== "") qs.set("severity", severity);
  if (search) qs.set("search", search);
  qs.set("hours", hours);
  qs.set("limit", "200");

  const q = useQuery<SyslogData>({
    queryKey: ["monitoring", "syslog", severity, search, hours],
    queryFn: () => apiRequest(`/api/monitoring/syslog?${qs.toString()}`),
    refetchInterval: 15000,
  });

  if (q.isError) return <Card><CardContent className="p-0"><ErrorState onRetry={() => q.refetch()} message="Could not load syslog." /></CardContent></Card>;

  const counts = q.data?.counts;
  const errPlus = num(counts?.emerg) + num(counts?.alert) + num(counts?.crit) + num(counts?.err);
  const infoNotice = num(counts?.info) + num(counts?.notice);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><ScrollText className="size-4 text-primary" /> Syslog Stream</CardTitle>
        <CardDescription>Device syslog ingested over UDP :30514 — newest first</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {/* Counts chips */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatChip label={"Total (window)"} value={formatNumber(num(q.data?.total))} />
          <StatChip label={"err & higher"} value={formatNumber(errPlus)} className={errPlus > 0 ? "border-red-500/40 bg-red-500/5 text-red-600" : ""} />
          <StatChip label="Warnings" value={formatNumber(num(counts?.warning))} className={num(counts?.warning) > 0 ? "border-amber-500/40 bg-amber-500/5 text-amber-600" : ""} />
          <StatChip label={"Info & notice"} value={formatNumber(infoNotice)} />
          <StatChip label="Debug" value={formatNumber(num(counts?.debug))} />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <StyledSelect value={severity} onChange={setSeverity} ariaLabel="Severity filter" className="shrink-0">
              <option value="">All severities</option>
              {Object.entries(SYSLOG_SEVERITY_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{v} · {label}</option>
              ))}
            </StyledSelect>
            <div className="relative min-w-[10rem] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search message, host, tag…"
                aria-label="Search syslog messages"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <WindowPills
            ariaLabel="Syslog window"
            value={hours}
            onChange={setHours}
            options={[{ id: "24", label: "24h" }, { id: "72", label: "72h" }, { id: "168", label: "7d" }]}
          />
        </div>

        {/* Entries */}
        {q.isLoading ? <TableSkeleton rows={8} /> : (q.data?.entries || []).length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No syslog messages"
            hint="No messages ingested yet — point device syslog at UDP :30514 or POST /api/monitoring/syslog."
          />
        ) : (
          <div className="max-h-96 overflow-auto rounded-md border cryptsk-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead className="w-52">Tag / Host</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-28 text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.entries || []).map((e) => (
                  <TableRow key={e.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${SYSLOG_SEVERITY_STYLES[e.severity] || SYSLOG_SEVERITY_STYLES[7]}`}>
                        {e.severityLabel || SYSLOG_SEVERITY_LABELS[e.severity] || e.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono font-medium">{e.tag || "—"}</div>
                      <div className="text-[10px] text-muted-foreground" title={`${e.host}${e.sourceIp ? ` · ${e.sourceIp}` : ""}${e.facility ? ` · ${e.facility}` : ""}`}>
                        {e.host || "—"}{e.sourceIp ? ` · ${e.sourceIp}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <span className="block max-w-[24rem] truncate font-mono text-xs lg:max-w-[36rem]" title={e.message}>{e.message}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground" title={new Date(e.receivedAt).toLocaleString()}>
                      {relTime(e.receivedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
