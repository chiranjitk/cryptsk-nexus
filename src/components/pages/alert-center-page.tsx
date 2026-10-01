"use client";

// ═══════════════════════════════════════════════════════════════
// Alert Center — unified alerting dashboard for the ALERT MANAGEMENT module
// Aggregates /api/alerts/analytics + live ACTIVE feed + quick links
// ═══════════════════════════════════════════════════════════════
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  BellRing, Siren, ClipboardList, History, PauseCircle, Bell, ArrowRight,
  Activity, CheckCircle2, Timer, TrendingUp, Loader2, AlertTriangle, Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/utils";
import { formatTimestamp } from "@/components/integrations/shared";

interface Analytics {
  dailyTrend: { date: string; count: number }[];
  severityDistribution: { severity: string; count: number }[];
  topSources: { ruleId: string | null; name: string; count: number }[];
  summary: { totalAlerts: number; resolvedCount: number; avgResolutionMin: number; medianResolutionMin: number; resolveRate: number };
}

interface LiveAlert {
  id: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  status: string;
  createdAt: string;
  duplicateCount: number;
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-amber-400",
  LOW: "bg-emerald-400",
  Info: "bg-sky-400",
  Low: "bg-emerald-400",
  Medium: "bg-amber-400",
  High: "bg-orange-500",
  Critical: "bg-red-500",
};

const LINKS = [
  { label: "Live Alerts", href: "/network-alerts", icon: Siren, desc: "Acknowledge, assign & resolve" },
  { label: "Alert Rules", href: "/alert-rules", icon: ClipboardList, desc: "Thresholds & escalation ladders" },
  { label: "Suppressions", href: "/alert-suppressions", icon: PauseCircle, desc: "Maintenance windows" },
  { label: "Alert History", href: "/alert-history", icon: History, desc: "Resolved alert archive" },
  { label: "Notification Rules", href: "/notification-rules", icon: Bell, desc: "Event → channel routing" },
];

export function AlertCenterPage() {
  const [days, setDays] = useState(7);
  const analytics = useQuery<Analytics>({
    queryKey: ["alert-analytics", days],
    queryFn: () => apiFetch(`/api/alerts/analytics?days=${days}`),
    refetchInterval: 30000,
  });
  const live = useQuery<{ alerts: LiveAlert[]; stats: { active: number; today: number; acknowledged: number; resolved: number } }>({
    queryKey: ["alert-center-live"],
    queryFn: () => apiFetch("/api/alerts?status=ACTIVE&limit=8"),
    refetchInterval: 15000,
  });

  const summary = analytics.data?.summary;
  const severities = analytics.data?.severityDistribution ?? [];
  const maxSev = Math.max(1, ...severities.map((s) => s.count));
  const trend = analytics.data?.dailyTrend ?? [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" />Alert Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Unified view of network alerts, resolution performance and escalation queue.</p>
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} className="h-7 text-xs px-3" onClick={() => setDays(d)}>{d}d</Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {analytics.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border shadow-sm"><CardContent className="p-4">
            <div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-red-100"><Siren className="h-5 w-5 text-red-600" /></div>
              <div><p className="text-xs text-muted-foreground">Total Alerts ({days}d)</p><p className="text-xl font-bold">{summary?.totalAlerts ?? 0}</p></div></div>
          </CardContent></Card>
          <Card className="border shadow-sm"><CardContent className="p-4">
            <div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-emerald-100"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
              <div><p className="text-xs text-muted-foreground">Resolve Rate</p><p className="text-xl font-bold text-emerald-700">{summary?.resolveRate ?? 0}%</p></div></div>
          </CardContent></Card>
          <Card className="border shadow-sm"><CardContent className="p-4">
            <div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-amber-100"><Timer className="h-5 w-5 text-amber-600" /></div>
              <div><p className="text-xs text-muted-foreground">Avg Resolution</p><p className="text-xl font-bold text-amber-700">{summary?.avgResolutionMin ?? 0}<span className="text-xs font-normal text-muted-foreground"> min</span></p></div></div>
          </CardContent></Card>
          <Card className="border shadow-sm"><CardContent className="p-4">
            <div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-violet-100"><TrendingUp className="h-5 w-5 text-violet-600" /></div>
              <div><p className="text-xs text-muted-foreground">Active Now</p><p className="text-xl font-bold text-violet-700">{live.data?.stats?.active ?? 0}</p></div></div>
          </CardContent></Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Severity distribution */}
        <Card className="border">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Layers className="h-4 w-4" />Severity Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {analytics.isLoading ? <Skeleton className="h-32 rounded-lg" /> : severities.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No alerts in this period 🎉</p>
            ) : severities.map((s) => (
              <div key={s.severity} className="flex items-center gap-3">
                <span className="text-xs w-16 font-medium">{s.severity}</span>
                <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${SEVERITY_STYLES[s.severity] ?? "bg-gray-400"}`} style={{ width: `${(s.count / maxSev) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold w-8 text-right">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Daily trend */}
        <Card className="border">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Activity className="h-4 w-4" />Daily Trend</CardTitle></CardHeader>
          <CardContent>
            {analytics.isLoading ? <Skeleton className="h-32 rounded-lg" /> : (
              <div className="flex items-end gap-1.5 h-32">
                {trend.length === 0 ? <p className="text-xs text-muted-foreground w-full text-center py-8">No data</p> : trend.map((t) => (
                  <div key={t.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${t.date}: ${t.count} alerts`}>
                    <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">{t.count}</span>
                    <div className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors" style={{ height: `${Math.max(4, (t.count / maxTrend) * 100)}%` }} />
                    <span className="text-[9px] text-muted-foreground">{t.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live feed */}
        <Card className="border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5"><Siren className="h-4 w-4 text-red-500" />Live Active Alerts</CardTitle>
              <Link href="/network-alerts" className="text-xs text-primary hover:underline flex items-center gap-1">Manage all <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto nice-scroll">
            {live.isLoading ? <Skeleton className="h-24 rounded-lg" /> : (live.data?.alerts ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No active alerts — all systems nominal ✓</p>
            ) : live.data!.alerts.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 rounded-lg border p-2.5 hover:bg-muted/30 transition-colors">
                <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${(SEVERITY_STYLES[a.severity] ?? "").includes("red") ? "text-red-500" : (SEVERITY_STYLES[a.severity] ?? "").includes("orange") ? "text-orange-500" : "text-amber-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold truncate">{a.title || a.source}</span>
                    <Badge variant="outline" className="text-[9px] uppercase">{a.severity}</Badge>
                    {a.duplicateCount > 1 && <Badge variant="secondary" className="text-[9px]">×{a.duplicateCount}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{a.message}</p>
                  <p className="text-[10px] text-muted-foreground/70">{formatTimestamp(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top sources + module links */}
        <div className="space-y-4">
          <Card className="border">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><TrendingUp className="h-4 w-4" />Top Alert Sources</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {analytics.isLoading ? <Skeleton className="h-16 rounded-lg" /> : (analytics.data?.topSources ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No sources recorded</p>
              ) : analytics.data!.topSources.slice(0, 5).map((src) => (
                <div key={src.ruleId ?? src.name} className="flex items-center justify-between text-xs border-b last:border-0 pb-1.5 last:pb-0">
                  <span className="font-medium truncate">{src.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{src.count} alerts</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Alert Management Modules</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="flex items-center gap-2.5 rounded-lg border p-2.5 hover:border-primary/40 hover:bg-muted/30 transition-colors group">
                  <div className="p-1.5 rounded-lg bg-primary/10"><l.icon className="h-4 w-4 text-primary" /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold group-hover:text-primary transition-colors">{l.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{l.desc}</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {analytics.isFetching && !analytics.isLoading && <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />refreshing…</p>}
    </div>
  );
}

export default AlertCenterPage;
