"use client";

/**
 * Dashboard inline chart cards — extracted from dashboard-page.tsx.
 *
 * recharts is ~2MB of module graph; previously it was imported statically by
 * dashboard-page, forcing a heavy compile into the MAIN dashboard chunk and
 * pinning baseline RSS near the sandbox OOM ceiling (2.4 GB). These cards are
 * lazy chunks now: recharts only compiles when a card actually mounts
 * (mount-on-visible gates that), instead of on every dashboard boot.
 */

import {
  IndianRupee,
  Users,
  Wifi,
  Activity,
  AlertTriangle,
  Monitor,
  BarChart3,
  Zap,
} from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";

const PIE_COLORS = [
  "#DC2626", "#0D9488", "#D97706", "#7C3AED", "#DB2777",
  "#059669", "#2563EB", "#C2410C", "#0891B2", "#65A30D",
];

function CustomTooltip({ active, payload, label, isCurrency = false, isPercent = false, isBandwidth = false }: {
  active?: boolean; payload?: { value: number; name: string; color: string; dataKey?: string }[];
  label?: string; isCurrency?: boolean; isPercent?: boolean; isBandwidth?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md glass-card">
      <p className="font-semibold text-foreground mb-2 text-[11px]">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-semibold text-foreground tabular-nums">
            {isBandwidth
              ? `${(item.value / 1000000).toFixed(1)} Mbps`
              : isCurrency
                ? formatINR(item.value)
                : isPercent
                  ? `${item.value}%`
                  : item.value.toLocaleString("en-IN")}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── 1. Bandwidth Utilization ───────────────────────────────────

export function BandwidthUtilizationCard({
  currentBandwidth,
  peakBandwidth,
  bandwidthUsageData,
  ipv6TrafficPercent,
  showIpv6,
}: {
  currentBandwidth: number;
  peakBandwidth: number;
  bandwidthUsageData: { hour: string; downloadBps: number; uploadBps: number }[];
  ipv6TrafficPercent?: number;
  showIpv6?: boolean;
}) {
  return (
    <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-teal-200 dark:hover:border-teal-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "535ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-teal-500" />
          Bandwidth Utilization
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-teal-200 text-teal-600">
            Current: {(currentBandwidth / 1000000).toFixed(1)} Mbps
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Utilization bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {(currentBandwidth / 1000000).toFixed(1)} Mbps <span className="mx-1">/</span> {(peakBandwidth / 1000000).toFixed(1)} Mbps Peak
            </span>
            <span className={`text-xs font-bold tabular-nums ${peakBandwidth > 0 && (currentBandwidth / peakBandwidth) > 0.85 ? "text-red-600" : peakBandwidth > 0 && (currentBandwidth / peakBandwidth) > 0.6 ? "text-yellow-600" : "text-green-600"}`}>
              {peakBandwidth > 0 ? ((currentBandwidth / peakBandwidth) * 100).toFixed(1) : 0}%
            </span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full animate-progress transition-colors duration-500"
              style={{
                "--progress": `${peakBandwidth > 0 ? Math.min((currentBandwidth / peakBandwidth) * 100, 100) : 0}%`,
                width: `${peakBandwidth > 0 ? Math.min((currentBandwidth / peakBandwidth) * 100, 100) : 0}%`,
                background: peakBandwidth > 0 && (currentBandwidth / peakBandwidth) > 0.85
                  ? "linear-gradient(90deg, #DC2626, #F87171)"
                  : peakBandwidth > 0 && (currentBandwidth / peakBandwidth) > 0.6
                    ? "linear-gradient(90deg, #D97706, #FBBF24)"
                    : "linear-gradient(90deg, #16A34A, #4ADE80)",
              } as React.CSSProperties}
            />
          </div>
        </div>
        {/* Bandwidth area chart */}
        {bandwidthUsageData.length > 0 ? (
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bandwidthUsageData}>
                <defs>
                  <linearGradient id="bwCurrentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="hour" tick={{ fill: "#94A3B8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}`} />
                <RechartsTooltip content={<CustomTooltip isBandwidth />} />
                <Area type="monotone" dataKey="downloadBps" name="Download" stroke="#0D9488" strokeWidth={1.5} fill="url(#bwCurrentGradient)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-36 text-xs text-muted-foreground">No bandwidth data</div>
        )}
        {showIpv6 && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
              <span>IPv6 Traffic</span>
            </div>
            <span className="text-muted-foreground">{ipv6TrafficPercent || 0}% of total</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 2. Revenue Trend + Subscriber Additions Row ────────────────

export function RevenueGrowthChartsRow({
  monthlyRevenueData,
  subscriberGrowthData,
  rangeLabel,
}: {
  monthlyRevenueData: { month: string; revenue: number }[];
  subscriberGrowthData: { month: string; additions: number }[];
  rangeLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "550ms" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-chart-1" />
            Revenue Trend (6 Months)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyRevenueData}>
                <defs>
                  <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 12 }} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <RechartsTooltip content={<CustomTooltip isCurrency />} />
                <Area type="monotone" dataKey="revenue" stroke="#DC2626" strokeWidth={2.5} fill="url(#revGradient)" dot={{ r: 4, fill: "#DC2626", strokeWidth: 2, stroke: "#fff" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-green-200 dark:hover:border-green-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "600ms" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-chart-2" />
            Subscriber Additions ({rangeLabel})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subscriberGrowthData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} allowDecimals={false} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar dataKey="additions" name="New Subscribers" fill="#16A34A" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 3. Plan Distribution Pie Card ──────────────────────────────

export function PlanDistributionCard({
  planDistribution,
}: {
  planDistribution: { plan: string; count: number }[];
}) {
  return (
    <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-amber-200 dark:hover:border-amber-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "650ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Wifi className="h-4 w-4 text-chart-3" />Plan Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={planDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="plan" strokeWidth={2} stroke="#fff">
                {planDistribution.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip formatter={(value: number, name: string) => [`${value} users`, name]} />
              <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: "11px" }} formatter={(value: string) => <span className="text-muted-foreground">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 4. Area-wise Revenue Card ──────────────────────────────────

export function AreaRevenueCard({
  areaWiseRevenue,
}: {
  areaWiseRevenue: { area: string; revenue: number }[];
}) {
  return (
    <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "750ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-chart-5" />Area-wise Revenue
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={areaWiseRevenue} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <YAxis dataKey="area" type="category" tick={{ fill: "#64748B", fontSize: 11 }} width={85} />
              <RechartsTooltip content={<CustomTooltip isCurrency />} />
              <Bar dataKey="revenue" name="Revenue" fill="#DC2626" radius={[0, 4, 4, 0]} barSize={18}>
                {areaWiseRevenue.map((_, index) => (
                  <Cell key={`bar-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 5. Complaint Trend Card ────────────────────────────────────

export function ComplaintTrendCard({
  complaintTrendData,
  openComplaints,
  rangeLabel,
}: {
  complaintTrendData: { date: string; complaints: number }[];
  openComplaints: number;
  rangeLabel: string;
}) {
  return (
    <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "760ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          Complaint Trend ({rangeLabel})
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-200 text-red-600">
            {openComplaints} open
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={complaintTrendData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} allowDecimals={false} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="complaints" name="Complaints" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 3, fill: "#DC2626", strokeWidth: 2, stroke: "#fff" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 6. Bandwidth Usage 24h Card ────────────────────────────────

export function BandwidthUsageCard({
  bandwidthUsageData,
  peakBandwidth,
}: {
  bandwidthUsageData: { hour: string; downloadBps: number; uploadBps: number }[];
  peakBandwidth: number;
}) {
  return (
    <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-green-200 dark:hover:border-green-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "810ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Monitor className="h-4 w-4 text-green-500" />
          Bandwidth Usage (24h)
          {peakBandwidth > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-200 text-green-600">
              Peak: {(peakBandwidth / 1000000).toFixed(1)} Mbps
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {bandwidthUsageData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No bandwidth data available</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bandwidthUsageData}>
                <defs>
                  <linearGradient id="dlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ulGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="hour" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}`} />
                <RechartsTooltip content={<CustomTooltip isBandwidth />} />
                <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(value: string) => <span className="text-muted-foreground">{value}</span>} />
                <Area type="monotone" dataKey="downloadBps" name="Download" stroke="#16A34A" strokeWidth={2} fill="url(#dlGradient)" />
                <Area type="monotone" dataKey="uploadBps" name="Upload" stroke="#0D9488" strokeWidth={2} fill="url(#ulGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 7. Plan Revenue Breakdown Card ─────────────────────────────

export function PlanRevenueCard({
  planRevenueBreakdown,
}: {
  planRevenueBreakdown: { plan: string; revenue: number; subscribers: number; arpu: number }[];
}) {
  return (
    <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-amber-200 dark:hover:border-amber-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "820ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-amber-500" />
          Plan Revenue Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {planRevenueBreakdown.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-3 text-muted-foreground">
            <div className="p-3 rounded-2xl bg-amber-100 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400">
              <BarChart3 className="h-8 w-8" />
            </div>
            <p className="text-sm">No revenue data available</p>
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planRevenueBreakdown} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <YAxis dataKey="plan" type="category" tick={{ fill: "#64748B", fontSize: 11 }} width={90} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0];
                    const planData = planRevenueBreakdown.find((p) => p.plan === label);
                    return (
                      <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
                        <p className="font-medium text-foreground mb-1">{label}</p>
                        <p className="text-muted-foreground">Revenue: {formatINR(item.value != null ? Number(item.value) : 0)}</p>
                        {planData && <p className="text-muted-foreground">{planData.subscribers} subscribers</p>}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} barSize={20}>
                  {planRevenueBreakdown.map((_, index) => (
                    <Cell key={`plan-bar-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
