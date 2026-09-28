"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { UsersPanel } from "@/components/admin/users-panel";
import { AuditPanel } from "@/components/admin/audit-panel";
import { RolesPanel } from "@/components/admin/roles-panel";
import { CustomersPanel } from "@/components/admin/customers-panel";
import { ProductsPanel } from "@/components/admin/products-panel";
import { NasPanel } from "@/components/admin/nas-panel";
import { RadiusAcctPanel } from "@/components/admin/radius-acct-panel";
import { RadiusPostAuthPanel } from "@/components/admin/radius-postauth-panel";
import { SessionsPanel } from "@/components/admin/sessions-panel";
import { PoliciesPanel } from "@/components/admin/policies-panel";
import { VppPanel } from "@/components/admin/vpp-panel";
import { BillingPanel } from "@/components/admin/billing-panel";
import {
  Users, Wifi, DollarSign, Activity, TrendingUp, TrendingDown,
  AlertCircle, Server, ShieldCheck, Zap, type LucideIcon,
  ArrowUpRight, ArrowDownRight, Clock, Cpu, HardDrive, MemoryStick,
  Radio, Eye, GitBranch, Bell, Plus, FileText, UserPlus, Settings2,
  ChevronRight, Brain, type LucideProps,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar,
} from "recharts";

// ============================================================
// CRYPTSK Nexus — Dashboard (Phase 0+ expanded)
// Per spec §07_UI_UX: 40-widget target. This page: 15+ widgets.
// ============================================================

const chartData = [
  { name: "Mon", sessions: 4200, revenue: 24000, throughput: 8.2 },
  { name: "Tue", sessions: 4800, revenue: 26500, throughput: 9.1 },
  { name: "Wed", sessions: 5200, revenue: 28200, throughput: 9.8 },
  { name: "Thu", sessions: 4900, revenue: 27100, throughput: 9.4 },
  { name: "Fri", sessions: 5800, revenue: 31000, throughput: 11.2 },
  { name: "Sat", sessions: 6100, revenue: 32500, throughput: 12.1 },
  { name: "Sun", sessions: 5500, revenue: 29800, throughput: 10.5 },
];

const planDistribution = [
  { name: "Basic 10Mbps", value: 1240, color: "#dc2626" },
  { name: "Standard 50Mbps", value: 890, color: "#16a34a" },
  { name: "Premium 100Mbps", value: 560, color: "#2563eb" },
  { name: "Business 500Mbps", value: 210, color: "#d97706" },
  { name: "Enterprise 1Gbps", value: 85, color: "#7c3aed" },
];

const hourlyThroughput = [
  { hour: "00", up: 2.1, down: 4.2 },
  { hour: "03", up: 1.5, down: 3.1 },
  { hour: "06", up: 3.2, down: 6.5 },
  { hour: "09", up: 8.5, down: 15.2 },
  { hour: "12", up: 9.8, down: 18.4 },
  { hour: "15", up: 8.9, down: 16.8 },
  { hour: "18", up: 10.2, down: 19.5 },
  { hour: "21", up: 7.5, down: 13.8 },
];

const recentActivity = [
  { user: "Super Admin", action: "Created plan", target: "Premium 100Mbps", time: "2 min ago", icon: Plus },
  { user: "NOC Operator", action: "Disconnected session", target: "user_8821", time: "5 min ago", icon: Radio },
  { user: "System", action: "RADIUS auth burst", target: "1,240 requests", time: "8 min ago", icon: Zap },
  { user: "Billing Mgr", action: "Generated invoice", target: "INV-2026-0042", time: "12 min ago", icon: FileText },
  { user: "Support Agent", action: "Resolved ticket", target: "TKT-7821", time: "18 min ago", icon: ShieldCheck },
  { user: "Field Tech", action: "Completed install", target: "CUST-1142", time: "25 min ago", icon: UserPlus },
];

const topSubscribers = [
  { name: "Acme Corp", plan: "Enterprise 1Gbps", usage: "842 GB", revenue: "₹45,000", status: "active" },
  { name: "TechHub India", plan: "Business 500Mbps", usage: "512 GB", revenue: "₹28,000", status: "active" },
  { name: "Green Valley Resort", plan: "Premium 100Mbps", usage: "298 GB", revenue: "₹12,000", status: "active" },
  { name: "City Hospital", plan: "Business 500Mbps", usage: "467 GB", revenue: "₹28,000", status: "active" },
  { name: "Sunrise Apartments", plan: "Standard 50Mbps", usage: "156 GB", revenue: "₹4,500", status: "active" },
];

const alerts = [
  { severity: "warning", title: "Gateway CPU > 80%", desc: "gateway-01 CPU at 84%", time: "3 min ago" },
  { severity: "info", title: "PostgreSQL backup complete", desc: "18.4 MB, 14 tables", time: "15 min ago" },
  { severity: "error", title: "3 RADIUS auth failures", desc: "nas-02, user brute-force?", time: "22 min ago" },
];

type StatCard = {
  title: string; value: string; change: string; trend: "up" | "down" | "neutral";
  icon: LucideIcon; color: string; bg: string;
};

const primaryStats: StatCard[] = [
  { title: "Active Subscribers", value: "2,985", change: "+42 this week", trend: "up", icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { title: "Live Sessions", value: "5,547", change: "+126 now", trend: "up", icon: Wifi, color: "text-blue-500", bg: "bg-blue-500/10" },
  { title: "Revenue (MTD)", value: "₹1,99,100", change: "+8.2%", trend: "up", icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { title: "Avg Session", value: "3h 42m", change: "-5 min", trend: "down", icon: Activity, color: "text-amber-500", bg: "bg-amber-500/10" },
];

const infraStats: StatCard[] = [
  { title: "Gateway CPU", value: "34%", change: "2.1 GHz avg", trend: "neutral", icon: Cpu, color: "text-violet-500", bg: "bg-violet-500/10" },
  { title: "Memory Usage", value: "1.2 GB", change: "of 7.5 GB", trend: "neutral", icon: MemoryStick, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  { title: "Disk Used", value: "3.5 GB", change: "of 70 GB", trend: "neutral", icon: HardDrive, color: "text-rose-500", bg: "bg-rose-500/10" },
  { title: "Auth Rate", value: "847/s", change: "+12% peak", trend: "up", icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10" },
];

function StatCard({ stat, delay }: { stat: StatCard; delay: number }) {
  return (
    <Card className="card-lift cryptsk-card-load overflow-hidden relative group" style={{ animationDelay: `${delay}ms` }}>
      <div className={`absolute right-0 top-0 size-24 rounded-full ${stat.bg} blur-2xl opacity-50 group-hover:opacity-80 transition-opacity`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
        <CardTitle className="text-xs font-medium text-muted-foreground">{stat.title}</CardTitle>
        <div className={`flex size-8 items-center justify-center rounded-lg ${stat.bg}`}>
          <stat.icon className={`size-4 ${stat.color}`} />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
        <div className="flex items-center gap-1 text-xs mt-1">
          {stat.trend === "up" && <TrendingUp className="size-3 text-emerald-500" />}
          {stat.trend === "down" && <TrendingDown className="size-3 text-rose-500" />}
          {stat.trend === "neutral" && <Activity className="size-3 text-muted-foreground" />}
          <span className={stat.trend === "up" ? "text-emerald-500" : stat.trend === "down" ? "text-rose-500" : "text-muted-foreground"}>
            {stat.change}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

const quickActions = [
  { label: "Add Subscriber", icon: UserPlus, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "Generate Invoice", icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
  { label: "Create Plan", icon: Plus, color: "text-violet-500", bg: "bg-violet-500/10" },
  { label: "RADIUS Test", icon: Radio, color: "text-amber-500", bg: "bg-amber-500/10" },
  { label: "View Logs", icon: Eye, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  { label: "Settings", icon: Settings2, color: "text-rose-500", bg: "bg-rose-500/10" },
];

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");

  // View switcher — renders admin panels based on ?view= param
  if (view === "users") return <UsersPanel />;
  if (view === "audit") return <AuditPanel />;
  if (view === "roles") return <RolesPanel />;
  if (view === "customers") return <CustomersPanel />;
  if (view === "products") return <ProductsPanel />;
  if (view === "nas") return <NasPanel />;
  if (view === "radius-acct") return <RadiusAcctPanel />;
  if (view === "radius-postauth") return <RadiusPostAuthPanel />;
  if (view === "sessions") return <SessionsPanel />;
  if (view === "policies") return <PoliciesPanel />;
  if (view === "vpp") return <VppPanel />;
  if (view === "billing") return <BillingPanel />;

  // Default: dashboard
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 cryptsk-fade-in">
      {/* ── Hero header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time overview of your ISP platform ·{" "}
            <span className="font-mono text-xs">Phase 0 — Architecture Foundation</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
            <div className="size-2 rounded-full bg-emerald-500 cryptsk-pulse-dot" />
            All systems operational
          </Badge>
          <Button variant="outline" size="sm" className="gap-1.5">
            <GitBranch className="size-3.5" />
            main
          </Button>
          <Button variant="default" size="sm" className="gap-1.5 bg-primary hover:bg-primary/90">
            <FileText className="size-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* ── Primary stat cards (4) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {primaryStats.map((stat, i) => (
          <StatCard key={stat.title} stat={stat} delay={i * 50} />
        ))}
      </div>

      {/* ── Charts row (sessions + revenue + throughput) ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="cryptsk-card-load lg:col-span-2 overflow-hidden relative" style={{ animationDelay: "200ms" }}>
          <div className="absolute right-0 top-0 size-32 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader className="relative">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wifi className="size-4 text-primary" />
                  Live Sessions & Throughput (7 days)
                </CardTitle>
                <CardDescription>Concurrent sessions + Gbps throughput</CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">7d</Badge>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                <XAxis dataKey="name" className="text-xs" tickLine={false} axisLine={false} />
                <YAxis className="text-xs" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "12px" }} />
                <Area type="monotone" dataKey="sessions" stroke="#dc2626" strokeWidth={2} fill="url(#colorSessions)" />
                <Area type="monotone" dataKey="throughput" stroke="#7c3aed" strokeWidth={2} fill="url(#colorThroughput)" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs">
              <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-primary" /> Sessions</div>
              <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-violet-500" /> Throughput (Gbps)</div>
            </div>
          </CardContent>
        </Card>

        <Card className="cryptsk-card-load overflow-hidden" style={{ animationDelay: "250ms" }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="size-4 text-emerald-500" />
              Revenue (7 days)
            </CardTitle>
            <CardDescription>Daily collected in ₹</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                <XAxis dataKey="name" className="text-xs" tickLine={false} axisLine={false} />
                <YAxis className="text-xs" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "12px" }} />
                <Bar dataKey="revenue" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
              {quickActions.map((qa) => (
                <button
                  key={qa.label}
                  className="flex flex-col items-center gap-2 rounded-lg border bg-card/50 p-3 hover:bg-accent hover:border-primary/30 transition-all card-lift"
                >
                  <div className={`flex size-10 items-center justify-center rounded-lg ${qa.bg}`}>
                    <qa.icon className={`size-5 ${qa.color}`} />
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight">{qa.label}</span>
                </button>
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
              <Button variant="ghost" size="sm" className="text-xs h-7">View all</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border bg-card/50 p-3 hover:bg-accent/50 transition-colors"
              >
                <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                  alert.severity === "error" ? "bg-rose-500/10" :
                  alert.severity === "warning" ? "bg-amber-500/10" : "bg-blue-500/10"
                }`}>
                  <AlertCircle className={`size-4 ${
                    alert.severity === "error" ? "text-rose-500" :
                    alert.severity === "warning" ? "text-amber-500" : "text-blue-500"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{alert.title}</p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{alert.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{alert.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Hourly throughput + plan distribution ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="cryptsk-card-load lg:col-span-2" style={{ animationDelay: "400ms" }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="size-4 text-blue-500" />
              Hourly Throughput (today)
            </CardTitle>
            <CardDescription>Upload vs Download in Gbps</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={hourlyThroughput}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                <XAxis dataKey="hour" className="text-xs" tickLine={false} axisLine={false} />
                <YAxis className="text-xs" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "12px" }} />
                <Line type="monotone" dataKey="down" stroke="#dc2626" strokeWidth={2} dot={{ fill: "#dc2626", r: 3 }} name="Download" />
                <Line type="monotone" dataKey="up" stroke="#16a34a" strokeWidth={2} dot={{ fill: "#16a34a", r: 3 }} name="Upload" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="cryptsk-card-load" style={{ animationDelay: "450ms" }}>
          <CardHeader>
            <CardTitle className="text-base">Plan Distribution</CardTitle>
            <CardDescription>Active subscribers by plan</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={planDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                  {planDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-1 space-y-1">
              {planDistribution.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="tabular-nums font-medium">{p.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Infrastructure stats (4) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {infraStats.map((stat, i) => (
          <StatCard key={stat.title} stat={stat} delay={500 + i * 50} />
        ))}
      </div>

      {/* ── Recent activity + top subscribers ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="cryptsk-card-load" style={{ animationDelay: "700ms" }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                Recent Activity
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">View audit log <ChevronRight className="size-3" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentActivity.map((act, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <act.icon className="size-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{act.user}</span>{" "}
                    <span className="text-muted-foreground">{act.action}</span>{" "}
                    <span className="font-medium text-primary">{act.target}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">{act.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="cryptsk-card-load" style={{ animationDelay: "750ms" }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4 text-primary" />
                Top Subscribers
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7">View all</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topSubscribers.map((sub, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border bg-card/50 p-2.5 hover:bg-accent/50 transition-colors">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                    {sub.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sub.name}</p>
                    <p className="text-[10px] text-muted-foreground">{sub.plan}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{sub.revenue}</p>
                    <p className="text-[10px] text-muted-foreground">{sub.usage}</p>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-600 text-[9px] shrink-0">
                    <div className="size-1.5 rounded-full bg-emerald-500 mr-1" />
                    {sub.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── System health ── */}
      <Card className="cryptsk-card-load" style={{ animationDelay: "800ms" }}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="size-4 text-primary" />
            System Health
          </CardTitle>
          <CardDescription>Platform infrastructure status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "RADIUS (FreeRADIUS 3.2.10)", status: "active", icon: ShieldCheck, detail: "1,240 auth/s" },
              { label: "PostgreSQL 18.6", status: "active", icon: Server, detail: "14 tables" },
              { label: "VPP Dataplane", status: "pending", icon: Zap, detail: "Phase 6" },
              { label: "Session Engine (Go)", status: "pending", icon: Activity, detail: "Phase 4" },
              { label: "AI Advisor", status: "active", icon: Brain, detail: "advisory" },
              { label: "Caddy Gateway", status: "active", icon: Server, detail: "v2.10.2" },
            ].map((svc) => (
              <div key={svc.label} className="flex items-center justify-between rounded-lg border bg-card/50 p-3 card-lift">
                <div className="flex items-center gap-2">
                  <div className={`flex size-8 items-center justify-center rounded-lg ${
                    svc.status === "active" ? "bg-emerald-500/10" : "bg-amber-500/10"
                  }`}>
                    <svc.icon className={`size-4 ${svc.status === "active" ? "text-emerald-500" : "text-amber-500"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{svc.label}</p>
                    <p className="text-[10px] text-muted-foreground">{svc.detail}</p>
                  </div>
                </div>
                <Badge variant="outline" className={
                  svc.status === "active"
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400"
                }>
                  {svc.status === "active" && <div className="size-1.5 rounded-full bg-emerald-500 mr-1.5 cryptsk-pulse-dot" />}
                  {svc.status === "pending" && <Clock className="size-2.5 mr-1.5" />}
                  {svc.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
