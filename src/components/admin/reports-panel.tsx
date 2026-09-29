"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  FileBarChart, IndianRupee, Activity, ShieldCheck, FileDown, LayoutGrid, TrendingUp, TrendingDown,
  Users, UserCheck, Wifi, Wallet, Clock, AlertTriangle, Download, Loader2, RefreshCw,
  FileSpreadsheet, Receipt, CreditCard, Wrench, HardDrive, Router, Gauge, Target, CheckCircle2, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatINR, humanBytes, formatDuration, formatNumber, relTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// CRYPTSK Nexus — Reports & Analytics (Menu v4.0 §11)
// Tabs: Report Center · Revenue & Collection · Usage & Bandwidth ·
//       Compliance & SLA · Data Export
// 100% real data — every number computed from live tables
// (invoices, payments, radacct, tickets, installations, audit).
// ============================================================

type Tab = "center" | "revenue" | "usage" | "sla" | "export";

const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "center", label: "Report Center", icon: LayoutGrid },
  { key: "revenue", label: "Revenue & Collection", icon: IndianRupee },
  { key: "usage", label: "Usage & Bandwidth", icon: Activity },
  { key: "sla", label: "Compliance & SLA", icon: ShieldCheck },
  { key: "export", label: "Data Export", icon: FileDown },
];

// ── shared bits ──────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, tone, trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "red" | "emerald" | "amber" | "violet" | "slate";
  trend?: number;
}) {
  const tones: Record<string, string> = {
    red: "text-red-600 bg-red-500/10",
    emerald: "text-emerald-600 bg-emerald-500/10",
    amber: "text-amber-600 bg-amber-500/10",
    violet: "text-violet-600 bg-violet-500/10",
    slate: "text-slate-600 bg-slate-500/10",
  };
  return (
    <Card className="gap-2 py-4 transition-shadow hover:shadow-md">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1.5 truncate text-2xl font-bold tabular-nums">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`rounded-lg p-2 shrink-0 ${tones[tone]}`}>
            <Icon className="size-4" />
          </div>
        </div>
        {typeof trend === "number" && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            {trend >= 0 ? (
              <TrendingUp className="size-3.5 text-emerald-600" aria-hidden />
            ) : (
              <TrendingDown className="size-3.5 text-red-600" aria-hidden />
            )}
            <span className={trend >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
              {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <AlertTriangle className="size-8 text-amber-500" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
        <RefreshCw className="size-3.5" /> Retry
      </Button>
    </div>
  );
}

function PctBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Progress value={Math.min(Math.max(pct, 0), 100)} className={className} aria-label={`${pct.toFixed(0)} percent`} />
      <span className="w-12 text-right text-xs font-medium tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  );
}

function chartTooltipFormatter(value: number | string): string {
  return typeof value === "number" ? formatINR(value, { compact: true }) : String(value);
}

// ── data hooks ───────────────────────────────────────────────

interface OverviewData {
  customers: { total: number; kycVerified: number; kycCoveragePct: number };
  subscribers: { total: number; active: number; suspended: number; pending: number; expiring7d: number; newThisMonth: number; newLastMonth: number; growthPct: number };
  revenue: { mrr: number; invoicedThisMonth: number; invoicedThisMonthCount: number; invoicedLastMonth: number; collectedThisMonth: number; collectedThisMonthCount: number; collectedLastMonth: number; collectionRatePct: number; growthPct: number; arpuMrr: number; arpuCollected: number };
  exposure: { outstanding: number; overdueCount: number };
  ops: { openTickets: number };
  catalog: { activePlans: number };
}

interface RevenueData {
  series: Array<{ month: string; label: string; invoiced: number; collected: number; outstanding: number; invoices: number; payments: number; collectionPct: number }>;
  summary: { invoicedThisMonth: number; collectedThisMonth: number; collectedLastMonth: number; collectionRatePct: number; growthPct: number; totalOverdueAmount: number; overdueInvoices: number };
  aging: Array<{ bucket: string; amount: number; invoices: number }>;
  methods: Array<{ method: string; amount: number; payments: number }>;
  topOutstanding: Array<{ customerId: string; displayName: string; customerCode: string; amount: number; invoices: number }>;
}

interface UsageData {
  window: { days: number; since: string };
  totals: { sessions: number; traffic: number; avgSessionSeconds: number; distinctUsers: number; liveNow: number; avgTrafficPerUser: number };
  trend: Array<{ day: string; up: number; down: number; sessions: number }>;
  topUsers: Array<{ username: string; sessions: number; traffic: number; avgSessionSeconds: number; lastSeen: string | null; displayName: string | null; subscriberCode: string | null; planName: string | null }>;
  nasBreakdown: Array<{ nasIp: string; sessions: number; traffic: number }>;
}

interface SlaData {
  sla: { overallCompliancePct: number | null; overallAvgResolutionHours: number; totalResolved: number; totalBreached: number };
  priorities: Array<{ priority: string; total: number; resolved: number; breached: number; slaMetPct: number | null; avgResolutionHours: number; p95ResolutionHours: number; avgSlaWindowHours: number }>;
  monthlyTrend: Array<{ month: string; created: number; resolved: number }>;
  categories: Array<{ category: string; total: number; resolved: number }>;
  installations: { scheduled: number; in_progress: number; completed: number; failed: number; rescheduled: number; completionRatePct: number | null };
  auditCoverage: { total: number; success: number; failure: number; successPct: number | null; windowDays: number };
}

// ── Report Center tab ────────────────────────────────────────

function ReportCenter({ onJump }: { onJump: (tab: Tab) => void }) {
  const { data, isLoading, isError, refetch } = useQuery<OverviewData>({
    queryKey: ["reports-overview"],
    queryFn: async () => {
      const res = await fetch("/api/reports/overview");
      if (!res.ok) throw new Error("Failed to load overview");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const templates: Array<{ tab: Tab; title: string; desc: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = [
    { tab: "revenue", title: "Monthly Revenue Report", desc: "Invoiced vs collected, aging buckets, method mix, top outstanding", icon: IndianRupee, tone: "text-emerald-600 bg-emerald-500/10" },
    { tab: "revenue", title: "Collection Efficiency Report", desc: "Collection rate per month + invoice aging distribution", icon: Target, tone: "text-amber-600 bg-amber-500/10" },
    { tab: "usage", title: "Subscriber Usage Report", desc: "Traffic totals, top-10 consumers, per-NAS load (radacct)", icon: Activity, tone: "text-red-600 bg-red-500/10" },
    { tab: "sla", title: "SLA Compliance Report", desc: "Priority-wise resolution SLA, P95, breach count, install rate", icon: ShieldCheck, tone: "text-violet-600 bg-violet-500/10" },
    { tab: "export", title: "Data Export", desc: "CSV extracts — subscribers, invoices, payments, sessions & more", icon: FileDown, tone: "text-slate-600 bg-slate-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI overview */}
      <section aria-label="Key performance indicators">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : isError ? (
          <ErrorState message="Could not load report overview." onRetry={() => refetch()} />
        ) : data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="MRR" value={formatINR(data.revenue.mrr, { compact: true })} sub={`${formatNumber(data.subscribers.active)} active subscribers`} icon={Wallet} tone="emerald" />
            <KpiCard label="Collected (MTD)" value={formatINR(data.revenue.collectedThisMonth, { compact: true })} sub={`${data.revenue.collectedThisMonthCount} payments received`} icon={CreditCard} tone="emerald" trend={data.revenue.growthPct} />
            <KpiCard label="Collection Rate (MTD)" value={`${data.revenue.collectionRatePct.toFixed(1)}%`} sub={`${formatINR(data.revenue.invoicedThisMonth, { compact: true })} invoiced`} icon={Target} tone="amber" />
            <KpiCard label="ARPU (MRR)" value={formatINR(data.revenue.arpuMrr)} sub={`collected ARPU ${formatINR(data.revenue.arpuCollected, { compact: true })}`} icon={Gauge} tone="violet" />
            <KpiCard label="Subscriber Growth" value={`+${data.subscribers.newThisMonth}`} sub={`${data.subscribers.newLastMonth} last month`} icon={Users} tone="red" trend={data.subscribers.growthPct} />
            <KpiCard label="Outstanding" value={formatINR(data.exposure.outstanding, { compact: true })} sub={`${data.exposure.overdueCount} overdue invoices`} icon={Clock} tone="amber" />
            <KpiCard label="KYC Coverage" value={`${data.customers.kycCoveragePct.toFixed(0)}%`} sub={`${data.customers.kycVerified}/${data.customers.total} customers verified`} icon={UserCheck} tone="slate" />
            <KpiCard label="Open Tickets" value={formatNumber(data.ops.openTickets)} sub={`${data.catalog.activePlans} active plans in catalog`} icon={Wrench} tone="red" />
          </div>
        ) : null}
      </section>

      {/* Templates */}
      <section aria-label="Report templates">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">REPORT TEMPLATES</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <button
              key={t.title}
              onClick={() => onJump(t.tab)}
              className="group text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              aria-label={`Open ${t.title}`}
            >
              <Card className="h-full gap-2 py-4 transition-all group-hover:shadow-md group-hover:border-primary/30">
                <CardContent className="flex items-start gap-3 px-4">
                  <div className={`rounded-lg p-2 shrink-0 ${t.tone}`}>
                    <t.icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{t.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Revenue & Collection tab ─────────────────────────────────

function RevenueReport() {
  const [months, setMonths] = React.useState(6);
  const { data, isLoading, isError, refetch, isFetching } = useQuery<RevenueData>({
    queryKey: ["reports-revenue", months],
    queryFn: async () => {
      const res = await fetch(`/api/reports/revenue?months=${months}`);
      if (!res.ok) throw new Error("Failed to load revenue report");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const agingTotal = data?.aging.reduce((s, b) => s + b.amount, 0) || 0;
  const methodTotal = data?.methods.reduce((s, m) => s + m.amount, 0) || 0;

  return (
    <div className="space-y-6">
      {/* summary chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-1" role="group" aria-label="Report window">
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${months === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              aria-pressed={months === m}
            >
              {m}m
            </button>
          ))}
        </div>
        {data && (
          <>
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600"><Receipt className="size-3" /> Invoiced MTD {formatINR(data.summary.invoicedThisMonth, { compact: true })}</Badge>
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600"><CreditCard className="size-3" /> Collected MTD {formatINR(data.summary.collectedThisMonth, { compact: true })}</Badge>
            <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600"><Clock className="size-3" /> Overdue {data.summary.overdueInvoices} · {formatINR(data.summary.totalOverdueAmount, { compact: true })}</Badge>
            {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Refreshing" />}
          </>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-64" /><Skeleton className="h-40" /></div>
      ) : isError ? (
        <ErrorState message="Could not load revenue report." onRetry={() => refetch()} />
      ) : data ? (
        <>
          {/* monthly chart */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Invoiced vs Collected ({months} months)</CardTitle></CardHeader>
            <CardContent>
              {data.series.every((s) => s.invoiced === 0 && s.collected === 0) ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Receipt className="size-8 text-muted-foreground/40" aria-hidden />
                  <p className="text-sm text-muted-foreground">No invoices or payments in this window yet — issue an invoice and record a payment to populate the report.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="label" className="text-xs" tickLine={false} axisLine={false} />
                    <YAxis className="text-xs" tickLine={false} axisLine={false} tickFormatter={(v: number) => formatINR(v, { compact: true })} width={62} />
                    <Tooltip formatter={chartTooltipFormatter} contentStyle={{ borderRadius: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="invoiced" name="Invoiced ₹" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={26} />
                    <Bar dataKey="collected" name="Collected ₹" fill="#16a34a" radius={[6, 6, 0, 0]} barSize={26} />
                    <Line type="monotone" dataKey="collectionPct" name="Collection %" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} yAxisId="pct" />
                    <YAxis yAxisId="pct" orientation="right" className="text-xs" tickLine={false} axisLine={false} unit="%" width={44} domain={[0, 100]} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* monthly table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Revenue Table</CardTitle></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Month</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="pr-6 text-right">Collection %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.series.map((s) => (
                    <TableRow key={s.month} className="hover:bg-muted/50">
                      <TableCell className="pl-6 font-medium">{s.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.invoices}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(s.invoiced)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.payments}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-emerald-600">{formatINR(s.collected)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600">{formatINR(s.outstanding)}</TableCell>
                      <TableCell className="pr-6">
                        {s.invoiced > 0 ? <PctBar pct={s.collectionPct} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* aging */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Invoice Aging</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {agingTotal === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No unpaid invoices — everything collected. 🎉</p>
                ) : (
                  data.aging.map((b) => (
                    <div key={b.bucket}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={b.bucket === "current" ? "font-medium text-emerald-600" : b.bucket === "90+" ? "font-medium text-red-600" : "font-medium text-amber-600"}>{b.bucket === "current" ? "Current" : `${b.bucket} days`}</span>
                        <span className="tabular-nums text-muted-foreground">{b.invoices} inv · {formatINR(b.amount)}</span>
                      </div>
                      <Progress value={agingTotal > 0 ? (b.amount / agingTotal) * 100 : 0} className={b.bucket === "current" ? "[&>div]:bg-emerald-500" : b.bucket === "90+" ? "[&>div]:bg-red-500" : "[&>div]:bg-amber-500"} aria-label={`${b.bucket}: ${formatINR(b.amount)}`} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* methods */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Payment Methods</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.methods.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No completed payments recorded yet.</p>
                ) : (
                  data.methods.map((m) => (
                    <div key={m.method}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium capitalize">{m.method.replace("_", " ")}</span>
                        <span className="tabular-nums text-muted-foreground">{m.payments} · {formatINR(m.amount)}</span>
                      </div>
                      <Progress value={methodTotal > 0 ? (m.amount / methodTotal) * 100 : 0} aria-label={`${m.method}: ${formatINR(m.amount)}`} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* top outstanding */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Top Outstanding Customers</CardTitle></CardHeader>
              <CardContent className="px-0">
                {data.topOutstanding.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Zero outstanding balances.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Customer</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                        <TableHead className="pr-6 text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topOutstanding.map((c) => (
                        <TableRow key={c.customerId}>
                          <TableCell className="pl-6">
                            <p className="text-sm font-medium leading-tight">{c.displayName}</p>
                            <p className="font-mono text-xs text-muted-foreground">{c.customerCode}</p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{c.invoices}</TableCell>
                          <TableCell className="pr-6 text-right font-semibold tabular-nums text-amber-600">{formatINR(c.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Usage & Bandwidth tab ────────────────────────────────────

function UsageReport() {
  const [days, setDays] = React.useState(30);
  const { data, isLoading, isError, refetch } = useQuery<UsageData>({
    queryKey: ["reports-usage", days],
    queryFn: async () => {
      const res = await fetch(`/api/reports/usage?days=${days}`);
      if (!res.ok) throw new Error("Failed to load usage report");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-1" role="group" aria-label="Report window">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              aria-pressed={days === d}
            >
              {d}d
            </button>
          ))}
        </div>
        {data && (
          <Badge variant="outline" className="gap-1 border-red-500/30 text-red-600">
            <Wifi className="size-3" /> {data.totals.liveNow} live session{data.totals.liveNow === 1 ? "" : "s"} right now
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-64" /></div>
      ) : isError ? (
        <ErrorState message="Could not load usage report." onRetry={() => refetch()} />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total Traffic" value={humanBytes(data.totals.traffic)} sub={`${formatNumber(data.totals.sessions)} sessions · ${days}d`} icon={Activity} tone="red" />
            <KpiCard label="Distinct Users" value={formatNumber(data.totals.distinctUsers)} sub={`avg ${humanBytes(data.totals.avgTrafficPerUser)} / user`} icon={Users} tone="emerald" />
            <KpiCard label="Avg Session" value={formatDuration(Math.round(data.totals.avgSessionSeconds))} sub="per completed session" icon={Clock} tone="violet" />
            <KpiCard label="Live Now" value={formatNumber(data.totals.liveNow)} sub="sessions without stop time" icon={Wifi} tone="amber" />
          </div>

          {/* traffic trend */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Daily Traffic Trend ({days} days)</CardTitle></CardHeader>
            <CardContent>
              {data.trend.length === 0 || data.trend.every((t) => t.up === 0 && t.down === 0) ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Router className="size-8 text-muted-foreground/40" aria-hidden />
                  <p className="text-sm text-muted-foreground">No RADIUS accounting data in this window — traffic appears here as sessions flow through FreeRADIUS.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <defs>
                      <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="day" className="text-xs" tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis className="text-xs" tickLine={false} axisLine={false} tickFormatter={(v: number) => humanBytes(v)} width={70} />
                    <Tooltip formatter={(v) => humanBytes(Number(v))} contentStyle={{ borderRadius: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="down" name="Download" stroke="#dc2626" strokeWidth={2} fill="url(#dlGrad)" />
                    <Area type="monotone" dataKey="up" name="Upload" stroke="#16a34a" strokeWidth={2} fill="url(#ulGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* top users */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Users by Traffic</CardTitle></CardHeader>
              <CardContent className="px-0">
                {data.topUsers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No accounting rows yet — top consumers rank here once sessions flow.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6 w-8">#</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Avg Session</TableHead>
                        <TableHead className="pr-6 text-right">Traffic</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topUsers.map((u, i) => (
                        <TableRow key={u.username} className={i < 3 ? "bg-amber-500/[0.04]" : ""}>
                          <TableCell className="pl-6">
                            <span className={`inline-flex size-6 items-center justify-center rounded-md text-xs font-bold ${i === 0 ? "bg-amber-500/15 text-amber-600" : i === 1 ? "bg-slate-500/15 text-slate-600" : i === 2 ? "bg-orange-500/15 text-orange-600" : "text-muted-foreground"}`}>{i + 1}</span>
                          </TableCell>
                          <TableCell>
                            <p className="font-mono text-sm leading-tight">{u.username}</p>
                            <p className="text-xs text-muted-foreground">
                              {u.displayName ? `${u.displayName}${u.planName ? ` · ${u.planName}` : ""}` : u.planName || "unknown subscriber"}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{u.sessions}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatDuration(Math.round(u.avgSessionSeconds))}</TableCell>
                          <TableCell className="pr-6 text-right font-semibold tabular-nums">{humanBytes(u.traffic)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* NAS breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">Per-NAS Load</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.nasBreakdown.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No NAS accounting traffic in window.</p>
                ) : (
                  data.nasBreakdown.map((n) => (
                    <div key={n.nasIp} className="rounded-lg border p-3 transition-colors hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-sm font-medium">{n.nasIp}</p>
                        <Badge variant="outline" className="font-mono text-xs">{humanBytes(n.traffic)}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.sessions} session{n.sessions === 1 ? "" : "s"} · last activity {n.sessions > 0 ? "in window" : "—"}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Compliance & SLA tab ─────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
  critical: "border-red-500/30 text-red-600",
  high: "border-amber-500/30 text-amber-600",
  medium: "border-violet-500/30 text-violet-600",
  low: "border-slate-400/30 text-slate-500",
};

function SlaReport() {
  const { data, isLoading, isError, refetch } = useQuery<SlaData>({
    queryKey: ["reports-sla"],
    queryFn: async () => {
      const res = await fetch("/api/reports/sla");
      if (!res.ok) throw new Error("Failed to load SLA report");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const compliance = data?.sla.overallCompliancePct;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-64" /></div>
      ) : isError ? (
        <ErrorState message="Could not load SLA report." onRetry={() => refetch()} />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="SLA Compliance"
              value={compliance == null ? "—" : `${compliance.toFixed(1)}%`}
              sub={compliance == null ? "no resolved tickets yet" : `${data.sla.totalBreached} of ${data.sla.totalResolved} breached`}
              icon={ShieldCheck}
              tone={compliance == null ? "slate" : compliance >= 90 ? "emerald" : compliance >= 70 ? "amber" : "red"}
            />
            <KpiCard label="Avg Resolution" value={`${data.sla.overallAvgResolutionHours.toFixed(1)}h`} sub="weighted across priorities" icon={Clock} tone="violet" />
            <KpiCard label="Install Completion" value={data.installations.completionRatePct === null ? "—" : `${data.installations.completionRatePct.toFixed(0)}%`} sub={`${data.installations.completed} completed · ${data.installations.failed} failed`} icon={CheckCircle2} tone="emerald" />
            <KpiCard label="Audit Events (30d)" value={formatNumber(data.auditCoverage.total)} sub={data.auditCoverage.successPct === null ? "no events" : `${data.auditCoverage.successPct.toFixed(1)}% success`} icon={FileSpreadsheet} tone="slate" />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* priority table */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2"><CardTitle className="text-base">Priority-wise SLA</CardTitle></CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Priority</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Resolved</TableHead>
                      <TableHead className="text-right">Breached</TableHead>
                      <TableHead className="text-right">Avg Res.</TableHead>
                      <TableHead className="text-right">P95 Res.</TableHead>
                      <TableHead className="pr-6 text-right">SLA Met</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.priorities.map((p) => (
                      <TableRow key={p.priority} className="hover:bg-muted/50">
                        <TableCell className="pl-6">
                          <Badge variant="outline" className={`gap-1 capitalize ${PRIORITY_STYLES[p.priority]}`}>
                            {p.priority === "critical" && <AlertTriangle className="size-3" />} {p.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.resolved}</TableCell>
                        <TableCell className={`text-right tabular-nums ${p.breached > 0 ? "font-medium text-red-600" : "text-muted-foreground"}`}>{p.breached}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.resolved > 0 ? `${p.avgResolutionHours.toFixed(1)}h` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.resolved > 0 ? `${p.p95ResolutionHours.toFixed(1)}h` : "—"}</TableCell>
                        <TableCell className="pr-6 text-right">
                          {p.slaMetPct === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.slaMetPct >= 90 ? "text-emerald-600" : p.slaMetPct >= 70 ? "text-amber-600" : "text-red-600"}`}>
                              {p.slaMetPct >= 90 ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                              {p.slaMetPct.toFixed(0)}%
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* category + installs */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">Ticket Categories & Field Ops</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {data.categories.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">No tickets logged yet.</p>
                  ) : (
                    data.categories.map((c) => (
                      <div key={c.category}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium capitalize">{c.category}</span>
                          <span className="tabular-nums text-muted-foreground">{c.resolved}/{c.total} resolved</span>
                        </div>
                        <Progress value={c.total > 0 ? (c.resolved / c.total) * 100 : 0} aria-label={`${c.category}: ${c.resolved} of ${c.total} resolved`} />
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Installations</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {([
                      ["Scheduled", data.installations.scheduled, "text-amber-600"],
                      ["In Progress", data.installations.in_progress, "text-violet-600"],
                      ["Completed", data.installations.completed, "text-emerald-600"],
                      ["Failed", data.installations.failed, "text-red-600"],
                      ["Rescheduled", data.installations.rescheduled, "text-amber-600"],
                    ] as Array<[string, number, string]>).map(([label, value, cls]) => (
                      <div key={label} className="rounded-lg border p-2">
                        <p className={`text-lg font-bold tabular-nums ${cls}`}>{value}</p>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      </div>
                    ))}
                    <div className="rounded-lg border p-2">
                      <p className="text-lg font-bold tabular-nums">{data.installations.completionRatePct === null ? "—" : `${data.installations.completionRatePct.toFixed(0)}%`}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rate</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* monthly trend */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Ticket Volume — Created vs Resolved (6 months)</CardTitle></CardHeader>
            <CardContent>
              {data.monthlyTrend.every((m) => m.created === 0 && m.resolved === 0) ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No ticket activity in the last 6 months.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.monthlyTrend.map((m) => ({ ...m, label: m.month.slice(2) }))} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="label" className="text-xs" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} className="text-xs" tickLine={false} axisLine={false} width={32} />
                    <Tooltip contentStyle={{ borderRadius: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="created" name="Created" fill="#dc2626" radius={[6, 6, 0, 0]} barSize={22} />
                    <Bar dataKey="resolved" name="Resolved" fill="#16a34a" radius={[6, 6, 0, 0]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ── Data Export tab ──────────────────────────────────────────

const EXPORTS: Array<{ type: string; title: string; desc: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = [
  { type: "subscribers", title: "Subscribers", desc: "RADIUS usernames, plans, status, service dates, static IP / VLAN", icon: Users, tone: "text-red-600 bg-red-500/10" },
  { type: "invoices", title: "Invoices", desc: "Full invoice register — amounts, tax, balances, statuses", icon: Receipt, tone: "text-emerald-600 bg-emerald-500/10" },
  { type: "payments", title: "Payments", desc: "Collections with method, gateway refs and reconciliation dates", icon: CreditCard, tone: "text-amber-600 bg-amber-500/10" },
  { type: "tickets", title: "Support Tickets", desc: "Complaint register with SLA deadlines and resolution times", icon: Wrench, tone: "text-violet-600 bg-violet-500/10" },
  { type: "installations", title: "Installations", desc: "Field jobs with technicians, schedules and completion", icon: HardDrive, tone: "text-slate-600 bg-slate-500/10" },
  { type: "inventory", title: "Inventory", desc: "Warehouse stock levels, reorder points and stock value", icon: FileSpreadsheet, tone: "text-emerald-600 bg-emerald-500/10" },
  { type: "sessions", title: "RADIUS Sessions", desc: "Accounting rows — duration, upload/download, framed IPs", icon: Router, tone: "text-red-600 bg-red-500/10" },
];

function DataExport() {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function download(type: string) {
    setBusy(type);
    try {
      const res = await fetch(`/api/reports/export?type=${type}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error || "Export failed");
      }
      const rowCount = res.headers.get("X-Export-Rows");
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition") || "";
      const match = dispo.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `cryptsk-nexus-${type}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: `${filename} — ${rowCount ?? "?"} rows downloaded.` });
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
        <FileDown className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Exports stream live rows as Excel-safe CSV (UTF-8 BOM, RFC 4180 quoting), capped at 20,000 rows per file.
          Every export is recorded in the audit trail with the initiating account — check Authentication Logs → Audit for the egress register.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXPORTS.map((e) => (
          <Card key={e.type} className="gap-2 py-4 transition-shadow hover:shadow-md">
            <CardContent className="flex h-full flex-col gap-3 px-4">
              <div className="flex items-start gap-3">
                <div className={`rounded-lg p-2 shrink-0 ${e.tone}`}>
                  <e.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{e.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{e.desc}</p>
                </div>
              </div>
              <div className="mt-auto">
                <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => download(e.type)} disabled={busy !== null} aria-label={`Download ${e.title} CSV`}>
                  {busy === e.type ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  Download CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── root panel ───────────────────────────────────────────────

export function ReportsPanel() {
  const searchParams = useSearchParams();
  const initial = (searchParams.get("tab") || "center") as Tab;
  const [tab, setTab] = React.useState<Tab>(TABS.some((t) => t.key === initial) ? initial : "center");

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <FileBarChart className="size-7 text-primary" aria-hidden />
            Reports & Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Business intelligence from live platform data · revenue, usage, SLA & exports
          </p>
        </div>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Report sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <t.icon className="size-3.5" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/* content */}
      <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === "center" && <ReportCenter onJump={setTab} />}
        {tab === "revenue" && <RevenueReport />}
        {tab === "usage" && <UsageReport />}
        {tab === "sla" && <SlaReport />}
        {tab === "export" && <DataExport />}
      </div>
    </div>
  );
}
