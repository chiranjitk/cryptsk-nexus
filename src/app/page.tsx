"use client";

import * as React from "react";
import {
  Users, Wifi, DollarSign, Activity, TrendingUp, TrendingDown,
  AlertCircle, Server, ShieldCheck, Zap, type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend,
} from "recharts";

// ============================================================
// CRYPTSK Nexus — Phase 0 Dashboard Shell
// 40-widget layout per spec §07_UI_UX (Phase 0: 8 core widgets)
// ============================================================

const chartData = [
  { name: "Mon", sessions: 4200, revenue: 24000 },
  { name: "Tue", sessions: 4800, revenue: 26500 },
  { name: "Wed", sessions: 5200, revenue: 28200 },
  { name: "Thu", sessions: 4900, revenue: 27100 },
  { name: "Fri", sessions: 5800, revenue: 31000 },
  { name: "Sat", sessions: 6100, revenue: 32500 },
  { name: "Sun", sessions: 5500, revenue: 29800 },
];

const planDistribution = [
  { name: "Basic 10Mbps", value: 1240, color: "#dc2626" },
  { name: "Standard 50Mbps", value: 890, color: "#16a34a" },
  { name: "Premium 100Mbps", value: 560, color: "#2563eb" },
  { name: "Business 500Mbps", value: 210, color: "#d97706" },
  { name: "Enterprise 1Gbps", value: 85, color: "#7c3aed" },
];

type StatCard = {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
  icon: LucideIcon;
  color: string;
};

const stats: StatCard[] = [
  { title: "Active Subscribers", value: "2,985", change: "+42 this week", trend: "up", icon: Users, color: "text-emerald-500" },
  { title: "Live Sessions", value: "5,547", change: "+126 now", trend: "up", icon: Wifi, color: "text-blue-500" },
  { title: "Revenue (MTD)", value: "₹1,99,100", change: "+8.2%", trend: "up", icon: DollarSign, color: "text-emerald-500" },
  { title: "Avg Session", value: "3h 42m", change: "-5 min", trend: "down", icon: Activity, color: "text-amber-500" },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 cryptsk-fade-in">
      {/* Page header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Real-time overview of your ISP platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <div className="size-2 rounded-full bg-emerald-500 cryptsk-pulse-dot" />
            All systems operational
          </Badge>
          <Button variant="default" size="sm">Export</Button>
        </div>
      </div>

      {/* Stat cards — 4 core widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={stat.title} className="card-lift cryptsk-card-load" style={{ animationDelay: `${i * 50}ms` }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`size-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
              <div className="flex items-center gap-1 text-xs">
                {stat.trend === "up" ? (
                  <TrendingUp className="size-3 text-emerald-500" />
                ) : stat.trend === "down" ? (
                  <TrendingDown className="size-3 text-rose-500" />
                ) : null}
                <span className={stat.trend === "up" ? "text-emerald-500" : stat.trend === "down" ? "text-rose-500" : "text-muted-foreground"}>
                  {stat.change}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row — sessions + revenue */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="cryptsk-card-load" style={{ animationDelay: "200ms" }}>
          <CardHeader>
            <CardTitle className="text-base">Live Sessions (7 days)</CardTitle>
            <CardDescription>Concurrent active subscriber sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stroke="#dc2626"
                  strokeWidth={2}
                  fill="url(#colorSessions)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="cryptsk-card-load" style={{ animationDelay: "250ms" }}>
          <CardHeader>
            <CardTitle className="text-base">Revenue (7 days)</CardTitle>
            <CardDescription>Daily collected revenue in ₹</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                  }}
                />
                <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row — plan distribution + system health */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 cryptsk-card-load" style={{ animationDelay: "300ms" }}>
          <CardHeader>
            <CardTitle className="text-base">Plan Distribution</CardTitle>
            <CardDescription>Active subscribers by plan</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={planDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                >
                  {planDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1.5">
              {planDistribution.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="size-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                    <span>{p.name}</span>
                  </div>
                  <span className="tabular-nums font-medium">{p.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System health */}
        <Card className="lg:col-span-2 cryptsk-card-load" style={{ animationDelay: "350ms" }}>
          <CardHeader>
            <CardTitle className="text-base">System Health</CardTitle>
            <CardDescription>Platform infrastructure status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "RADIUS (FreeRADIUS 3.2.10)", status: "active", icon: ShieldCheck },
                { label: "PostgreSQL 18.6", status: "active", icon: Server },
                { label: "VPP Dataplane", status: "pending", icon: Zap },
                { label: "Session Engine", status: "pending", icon: Activity },
                { label: "AI Advisor", status: "active", icon: ShieldCheck },
                { label: "Caddy Gateway", status: "active", icon: Server },
              ].map((svc) => (
                <div
                  key={svc.label}
                  className="flex items-center justify-between rounded-lg border bg-card/50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <svc.icon className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{svc.label}</span>
                  </div>
                  <Badge
                    variant={svc.status === "active" ? "default" : "secondary"}
                    className={svc.status === "active"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }
                  >
                    {svc.status === "active" ? (
                      <div className="size-1.5 rounded-full bg-emerald-500 mr-1.5 cryptsk-pulse-dot" />
                    ) : (
                      <AlertCircle className="size-3 mr-1.5" />
                    )}
                    {svc.status === "active" ? "Active" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
