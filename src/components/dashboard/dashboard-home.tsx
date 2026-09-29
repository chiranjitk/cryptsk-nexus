"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Wifi, DollarSign, Wallet, TrendingUp, TrendingDown, Activity,
  AlertCircle, Server, ShieldCheck, Zap, Radio, Eye, Settings2, UserPlus,
  FileText, Network, Brain, RefreshCw, Info, AlertTriangle, ListChecks,
  Globe, Boxes, Clock, Gauge, Bell, Wrench, LifeBuoy, HardHat, Package2, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, LineChart, Line, ComposedChart } from "recharts";
import { formatINR, humanBytes, formatDuration, formatNumber, relTime } from "@/lib/format";

// ============================================================
// CRYPTSK Nexus — Dashboard (real data, zero mock values)
// Widgets per spec 07_UI_UX §14-17; sources = /api/dashboard/stats
// ============================================================

type DashboardStats = {
  generatedAt: string;
  subscribers: { total: number; active: number; suspended: number; inactive: number; pending: number; new7d: number; new30d: number };
  customers: { total: number; active: number; new7d: number; kycPending: number };
  sessions: { active: number; today: number; week: number; trafficTodayBytes: number; avgSessionSec: number };
  auth: { accept24h: number; reject24h: number; total24h: number; rate24h: number | null };
  billing: { revenueMtd: number; revenueToday: number; outstanding: number; overdue: number; invoices: { draft: number; issued: number; paid: number; partial: number }; paymentsPending: number };
  network: { nasTotal: number; nasActive: number; dhcpLeases: number; dhcpSubnets: number; dnsZones: number; dnsRecords: number; firewallRules: number };
  modules: { active: number; total: number };
  operations: {
    tickets: { open: number; inProgress: number; pending: number; critical: number; unassigned: number };
    installations: { today: number; upcoming: number; technicians: number };
    inventory: { lowStock: number; outOfStock: number; stockValue: number };
  };
  planDistribution: Array<{ name: string; value: number; color: string }>;
  topSubscribers: Array<{ username: string; plan: string | null; trafficBytes: number; sessions: number }>;
  hourlyThroughput: Array<{ hour: string; down: number; up: number }>;
  dailyTrend: Array<{ day: string; sessions: number; revenue: number }>;
  recentActivity: Array<{ id: string; user: string; action: string; resource: string; result: string | null; createdAt: string }>;
  alerts: Array<{ severity: "error" | "warning" | "info"; title: string; desc: string; time: string }>;
};

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create: UserPlus, update: RefreshCw, delete: AlertCircle, login: ShieldCheck,
  login_failed: AlertTriangle, execute: Zap, export: FileText, config_change: Settings2,
  permission_change: ShieldCheck, role_change: ShieldCheck, module_toggle: Boxes,
  feature_flag_toggle: Zap, logout: ShieldCheck, approve: ListChecks,
};

const QUICK_ACTIONS = [
  { label: "Add Customer", icon: UserPlus, href: "/?view=customers", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "New Invoice", icon: FileText, href: "/?view=billing", color: "text-amber-500", bg: "bg-amber-500/10" },
  { label: "AI Assistant", icon: Brain, href: "/?view=ai", color: "text-violet-500", bg: "bg-violet-500/10" },
  { label: "Live Sessions", icon: Radio, href: "/?view=sessions", color: "text-rose-500", bg: "bg-rose-500/10" },
  { label: "Network", icon: Network, href: "/?view=network", color: "text-cyan-500", bg: "bg-cyan-500/10" },
  { label: "Admin", icon: Settings2, href: "/?view=admin", color: "text-stone-500", bg: "bg-stone-500/10" },
];

function StatCard({ title, value, sub, icon: Icon, color, bg, delay, href }: {
  title: string; value: string; sub: React.ReactNode; icon: React.ComponentType<{ className?: string }>;
  color: string; bg: string; delay: number; href?: string;
}) {
  const inner = (
    <Card className="card-lift cryptsk-card-load overflow-hidden relative group h-full" style={{ animationDelay: `${delay}ms` }}>
      <div className={`absolute right-0 top-0 size-24 rounded-full ${bg} blur-2xl opacity-50 group-hover:opacity-80 transition-opacity`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`flex size-8 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`size-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs mt-1 text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

const tooltipStyle = { backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "12px" };

export function DashboardHome() {
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
    retry: 1,
  });

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/10">
          <AlertCircle className="size-7 text-rose-500" />
        </div>
        <div className="text-center">
          <p className="font-semibold">Failed to load dashboard</p>
          <p className="text-sm text-muted-foreground">The stats service returned an error. Check that PostgreSQL is running and retry.</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    );
  }

  // ── Loading skeletons (layout-stable) ──
  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-20" /><Skeleton className="h-3 w-28" />
            </CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[350px] lg:col-span-2" />
          <Skeleton className="h-[350px]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[260px] lg:col-span-2" />
        </div>
      </div>
    );
  }

  const { subscribers, sessions, billing, auth, network, modules } = data;
  const hasAlerts = data.alerts.length > 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 cryptsk-fade-in">
      {/* ── Hero header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live platform overview · updated {relTime(data.generatedAt)} · auto-refresh 30s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
            <div className="size-2 rounded-full bg-emerald-500 cryptsk-pulse-dot" />
            PostgreSQL 18 connected
          </Badge>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Primary stat cards (real values) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Subscribers" value={formatNumber(subscribers.active)}
          icon={Users} color="text-emerald-500" bg="bg-emerald-500/10" delay={0}
          href="/?view=customers"
          sub={
            <span className="flex items-center gap-1">
              {subscribers.new7d > 0 ? <TrendingUp className="size-3 text-emerald-500" /> : <Activity className="size-3 text-muted-foreground" />}
              +{subscribers.new7d} in 7d · {formatNumber(subscribers.total)} total
            </span>
          }
        />
        <StatCard
          title="Live Sessions" value={formatNumber(sessions.active)}
          icon={Wifi} color="text-rose-500" bg="bg-rose-500/10" delay={50}
          href="/?view=sessions"
          sub={
            <span className="flex items-center gap-1">
              <Radio className="size-3 text-rose-500" />
              {formatNumber(sessions.today)} started today · {humanBytes(sessions.trafficTodayBytes)} moved
            </span>
          }
        />
        <StatCard
          title="Revenue (MTD)" value={formatINR(billing.revenueMtd, { compact: true })}
          icon={DollarSign} color="text-emerald-500" bg="bg-emerald-500/10" delay={100}
          href="/?view=billing"
          sub={
            <span className="flex items-center gap-1">
              <TrendingUp className="size-3 text-emerald-500" />
              {formatINR(billing.revenueToday, { compact: true })} today
            </span>
          }
        />
        <StatCard
          title="Outstanding" value={formatINR(billing.outstanding, { compact: true })}
          icon={Wallet} color={billing.overdue > 0 ? "text-rose-500" : "text-amber-500"} bg={billing.overdue > 0 ? "bg-rose-500/10" : "bg-amber-500/10"} delay={150}
          href="/?view=billing"
          sub={
            <span className="flex items-center gap-1">
              {billing.overdue > 0 ? <TrendingDown className="size-3 text-rose-500" /> : <TrendingUp className="size-3 text-emerald-500" />}
              {billing.overdue} overdue · {formatNumber(billing.invoices.paid)} invoices paid
            </span>
          }
        />
      </div>

      {/* ── Sessions & revenue trend + plan distribution ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="cryptsk-card-load lg:col-span-2 overflow-hidden relative" style={{ animationDelay: "200ms" }}>
          <div className="absolute right-0 top-0 size-32 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader className="relative">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  Sessions & Collections (7 days)
                </CardTitle>
                <CardDescription>RADIUS sessions started + payments collected per day</CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">7d</Badge>
            </div>
          </CardHeader>
          <CardContent className="relative">
            {data.dailyTrend.some((d) => d.sessions > 0 || d.revenue > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={data.dailyTrend}>
                  <defs>
                    <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis dataKey="day" className="text-xs" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" className="text-xs" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area yAxisId="left" type="monotone" dataKey="sessions" name="Sessions" stroke="#dc2626" strokeWidth={2} fill="url(#colorSessions)" />
                  <Bar yAxisId="right" dataKey="revenue" name="Collected ₹" fill="#16a34a" radius={[6, 6, 0, 0]} barSize={28} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 h-[280px] text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted"><Activity className="size-6 text-muted-foreground" /></div>
                <p className="text-sm font-medium">No session or payment activity yet</p>
                <p className="text-xs text-muted-foreground max-w-sm">Charts populate automatically once RADIUS accounting events and payments start flowing into PostgreSQL.</p>
              </div>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs">
              <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-primary" /> Sessions</div>
              <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-emerald-600" /> Collected (₹)</div>
            </div>
          </CardContent>
        </Card>

        <Card className="cryptsk-card-load overflow-hidden" style={{ animationDelay: "250ms" }}>
          <CardHeader>
            <CardTitle className="text-base">Plan Distribution</CardTitle>
            <CardDescription>Active subscriptions by plan</CardDescription>
          </CardHeader>
          <CardContent>
            {data.planDistribution.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={data.planDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                      {data.planDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 space-y-1 max-h-24 overflow-y-auto cryptsk-scrollbar">
                  {data.planDistribution.map((p) => (
                    <div key={p.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="truncate">{p.name}</span>
                      </div>
                      <span className="tabular-nums font-medium">{formatNumber(p.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 h-[248px] text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted"><Gauge className="size-6 text-muted-foreground" /></div>
                <p className="text-sm font-medium">No active subscriptions yet</p>
                <Button asChild variant="outline" size="sm" className="mt-1">
                  <Link href="/?view=products">Create a plan</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick actions + alerts ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="cryptsk-card-load" style={{ animationDelay: "300ms" }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_ACTIONS.map((qa) => (
                <Link key={qa.label} href={qa.href}
                  className="flex flex-col items-center gap-2 rounded-lg border bg-card/50 p-3 hover:bg-accent hover:border-primary/30 transition-all card-lift">
                  <div className={`flex size-10 items-center justify-center rounded-lg ${qa.bg}`}>
                    <qa.icon className={`size-5 ${qa.color}`} />
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight">{qa.label}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="cryptsk-card-load lg:col-span-2" style={{ animationDelay: "350ms" }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                Alerts
              </CardTitle>
              <Badge variant={hasAlerts ? "destructive" : "outline"} className="text-[10px]">{data.alerts.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-56 overflow-y-auto cryptsk-scrollbar">
            {hasAlerts ? (
              data.alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border bg-card/50 p-3 hover:bg-accent/50 transition-colors">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    alert.severity === "error" ? "bg-rose-500/10" :
                    alert.severity === "warning" ? "bg-amber-500/10" : "bg-cyan-500/10"
                  }`}>
                    {alert.severity === "error" ? <AlertCircle className="size-4 text-rose-500" /> :
                     alert.severity === "warning" ? <AlertTriangle className="size-4 text-amber-500" /> :
                     <Info className="size-4 text-cyan-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{alert.title}</p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{alert.time}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{alert.desc}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <ShieldCheck className="size-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">All clear</p>
                  <p className="text-xs text-muted-foreground">No overdue invoices, suspicious auth patterns, or inactive NAS devices detected.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Hourly throughput + top subscribers ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="cryptsk-card-load lg:col-span-2" style={{ animationDelay: "400ms" }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="size-4 text-rose-500" />
              Throughput (last 12h)
            </CardTitle>
            <CardDescription>Upload vs Download volume per hour, from RADIUS accounting</CardDescription>
          </CardHeader>
          <CardContent>
            {data.hourlyThroughput.some((h) => h.up > 0 || h.down > 0) ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.hourlyThroughput}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis dataKey="hour" className="text-xs" tickLine={false} axisLine={false} unit="h" />
                  <YAxis className="text-xs" tickLine={false} axisLine={false} unit="Gb" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="down" stroke="#dc2626" strokeWidth={2} dot={false} name="Download" />
                  <Line type="monotone" dataKey="up" stroke="#16a34a" strokeWidth={2} dot={false} name="Upload" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 h-[240px] text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted"><Radio className="size-6 text-muted-foreground" /></div>
                <p className="text-sm font-medium">No traffic recorded in the last 12 hours</p>
                <p className="text-xs text-muted-foreground">Accounting packets (Acct-Status-Type Start/Stop) will populate this chart.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="cryptsk-card-load" style={{ animationDelay: "450ms" }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4 text-primary" />
                Top Talkers (7d)
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs h-7">
                <Link href="/?view=radius-acct">Accounting</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {data.topSubscribers.length > 0 ? (
              <div className="space-y-2">
                {data.topSubscribers.map((sub) => (
                  <div key={sub.username} className="flex items-center gap-3 rounded-lg border bg-card/50 p-2.5 hover:bg-accent/50 transition-colors">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                      {sub.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate font-mono">{sub.username}</p>
                      <p className="text-[10px] text-muted-foreground">{sub.plan ?? "No plan"} · {sub.sessions} session{sub.sessions !== 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0">{humanBytes(sub.trafficBytes)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 h-[200px] text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted"><Users className="size-6 text-muted-foreground" /></div>
                <p className="text-sm font-medium">No accounting data yet</p>
                <p className="text-xs text-muted-foreground">Top traffic consumers will appear here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Infra stats row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Auth Success (24h)"
          value={auth.rate24h !== null ? `${auth.rate24h}%` : "—"}
          icon={ShieldCheck} color="text-amber-500" bg="bg-amber-500/10" delay={500}
          sub={<span>{formatNumber(auth.accept24h)} accepted · {formatNumber(auth.reject24h)} rejected</span>}
        />
        <StatCard title="NAS Devices" value={`${network.nasActive}/${network.nasTotal}`}
          icon={Server} color="text-violet-500" bg="bg-violet-500/10" delay={550} href="/?view=nas"
          sub={<span>{network.nasActive} active access clients</span>}
        />
        <StatCard title="DHCP Leases" value={formatNumber(network.dhcpLeases)}
          icon={Globe} color="text-cyan-500" bg="bg-cyan-500/10" delay={600} href="/?view=network"
          sub={<span>{network.dhcpSubnets} subnets · {network.dnsZones} DNS zones</span>}
        />
        <StatCard title="Modules Active" value={`${modules.active}/${modules.total}`}
          icon={Boxes} color="text-stone-500" bg="bg-stone-500/10" delay={650} href="/?view=admin"
          sub={<span>{network.firewallRules} firewall rules · {network.dnsRecords} DNS records</span>}
        />
      </div>


      {/* ── Operational pulse (tickets / field ops / stock) ── */}
      <Card className="cryptsk-card-load" style={{ animationDelay: "680ms" }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="size-4 text-primary" />
                Operational Pulse
              </CardTitle>
              <CardDescription>Live support queue, field operations and warehouse health</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs h-7 gap-1">
              <Link href="/?view=operations">Open Operations <ChevronRight className="size-3" /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Support queue */}
            <Link href="/?view=operations" className="group rounded-lg border bg-card/50 p-4 hover:border-primary/30 hover:bg-accent/40 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <LifeBuoy className="size-3.5 text-rose-500" /> Support Queue
                </p>
                {data.operations.tickets.critical > 0 && (
                  <Badge variant="destructive" className="text-[9px] gap-1">
                    <span className="size-1.5 rounded-full bg-red-400 animate-pulse" /> {data.operations.tickets.critical} critical
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-3xl font-bold tabular-nums">{formatNumber(data.operations.tickets.open + data.operations.tickets.inProgress + data.operations.tickets.pending)}</span>
                <span className="text-xs text-muted-foreground mb-1">active tickets</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Open", v: data.operations.tickets.open, dot: "bg-red-500" },
                  { label: "Working", v: data.operations.tickets.inProgress, dot: "bg-amber-500" },
                  { label: "Waiting", v: data.operations.tickets.pending, dot: "bg-cyan-500" },
                  { label: "Unassigned", v: data.operations.tickets.unassigned, dot: "bg-stone-400" },
                ].map((c) => (
                  <div key={c.label} className="rounded-md bg-muted/50 py-1.5">
                    <p className="text-sm font-bold tabular-nums leading-none">{c.v}</p>
                    <p className="mt-1 flex items-center justify-center gap-1 text-[9px] text-muted-foreground leading-none">
                      <span className={`size-1.5 rounded-full ${c.dot}`} />{c.label}
                    </p>
                  </div>
                ))}
              </div>
            </Link>
            {/* Field ops */}
            <Link href="/?view=operations" className="group rounded-lg border bg-card/50 p-4 hover:border-primary/30 hover:bg-accent/40 transition-all">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <HardHat className="size-3.5 text-violet-500" /> Field Installations
              </p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-3xl font-bold tabular-nums">{formatNumber(data.operations.installations.today)}</span>
                <span className="text-xs text-muted-foreground mb-1">scheduled today</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                  <span className="text-muted-foreground">Upcoming</span>
                  <span className="font-semibold tabular-nums">{formatNumber(data.operations.installations.upcoming)}</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                  <span className="text-muted-foreground">Technicians on job</span>
                  <span className="font-semibold tabular-nums">{formatNumber(data.operations.installations.technicians)}</span>
                </div>
              </div>
            </Link>
            {/* Inventory */}
            <Link href="/?view=operations" className="group rounded-lg border bg-card/50 p-4 hover:border-primary/30 hover:bg-accent/40 transition-all">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Package2 className="size-3.5 text-emerald-500" /> Warehouse & Stock
              </p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-3xl font-bold tabular-nums">{formatINR(data.operations.inventory.stockValue, { compact: true })}</span>
                <span className="text-xs text-muted-foreground mb-1">stock value</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className={`rounded-md px-2.5 py-1.5 text-xs ${data.operations.inventory.lowStock > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted/50 text-muted-foreground"}`}>
                  <span className="font-bold tabular-nums">{data.operations.inventory.lowStock}</span> low stock
                </div>
                <div className={`rounded-md px-2.5 py-1.5 text-xs ${data.operations.inventory.outOfStock > 0 ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-muted/50 text-muted-foreground"}`}>
                  <span className="font-bold tabular-nums">{data.operations.inventory.outOfStock}</span> out of stock
                </div>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ── Recent activity + subscriber lifecycle ── */}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="cryptsk-card-load" style={{ animationDelay: "700ms" }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                Recent Activity
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs h-7 gap-1">
                <Link href="/?view=audit">View audit log</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 max-h-80 overflow-y-auto cryptsk-scrollbar">
            {data.recentActivity.length > 0 ? (
              data.recentActivity.map((act) => {
                const Icon = ACTION_ICONS[act.action] ?? Activity;
                return (
                  <div key={act.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors">
                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                      act.result === "denied" ? "bg-rose-500/10" : "bg-muted"
                    }`}>
                      <Icon className={`size-3.5 ${act.result === "denied" ? "text-rose-500" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        <span className="font-medium">{act.user}</span>{" "}
                        <span className="text-muted-foreground">{act.action}</span>{" "}
                        <span className="font-medium text-primary">{act.resource}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">{relTime(act.createdAt)}{act.description ? ` · ${act.description}` : ""}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Clock className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="cryptsk-card-load" style={{ animationDelay: "750ms" }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4 text-primary" />
              Subscriber Lifecycle
            </CardTitle>
            <CardDescription>Status distribution across {formatNumber(subscribers.total)} subscribers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Active", value: subscribers.active, total: subscribers.total, cls: "bg-emerald-500", text: "text-emerald-500" },
              { label: "Suspended", value: subscribers.suspended, total: subscribers.total, cls: "bg-amber-500", text: "text-amber-500" },
              { label: "Pending activation", value: subscribers.pending, total: subscribers.total, cls: "bg-cyan-500", text: "text-cyan-500" },
              { label: "Inactive", value: subscribers.inactive, total: subscribers.total, cls: "bg-stone-400", text: "text-stone-400" },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium">{row.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(row.value)} · {row.total > 0 ? Math.round((row.value / row.total) * 100) : 0}%
                  </span>
                </div>
                <Progress value={row.total > 0 ? (row.value / row.total) * 100 : 0} className="h-2 [&>div]:bg-current" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border bg-card/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg session (7d)</p>
                <p className="text-lg font-bold tabular-nums">{formatDuration(sessions.avgSessionSec)}</p>
              </div>
              <div className="rounded-lg border bg-card/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">KYC pending</p>
                <p className="text-lg font-bold tabular-nums">{formatNumber(data.customers.kycPending)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
