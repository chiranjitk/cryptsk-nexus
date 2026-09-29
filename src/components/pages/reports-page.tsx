"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Users,
  Wifi,
  Wrench,
  DollarSign,
  TrendingUp,
  Download,
  Calendar as CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  FileDown,
  Activity,
  Clock,
  Target,
  Gauge,
  Wallet,
  Receipt,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  SlidersHorizontal,
  Loader2,
  Filter,
  DownloadCloud,
  Shield,
  HardDrive,
  Radio,
  Server,
  Timer,
  Hash,
} from "lucide-react";
import { apiFetch, formatINR } from "@/lib/utils";
import { format } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────

const formatNum = (n: number) =>
  new Intl.NumberFormat("en-IN").format(n);

// ─── Period Config ────────────────────────────────────────────

const PERIODS = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "This Quarter", value: "quarter" },
  { label: "This Year", value: "year" },
];

// ─── CSV Export Helpers ───────────────────────────────────────

function toCsvRow(row: Record<string, unknown>): string {
  return Object.values(row)
    .map((v) => {
      const str = String(v ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(",");
}

function downloadCsv(filename: string, headers: string[], rows: Record<string, unknown>[]) {
  const csv = [headers.join(","), ...rows.map(toCsvRow)].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── SVG Chart Components ─────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  gradient,
  delay,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  gradient: string;
  delay: number;
  sub?: string;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg animate-card-enter`} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm opacity-90 truncate">{label}</p>
          <p className="text-xl font-bold truncate tabular-nums">{value}</p>
          {sub && <p className="text-xs opacity-75 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SVGLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

function AreaChart({ data, xKey, yKey, color, height = 240, label }: {
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
  color: string;
  height?: number;
  label: string;
}) {
  if (!data.length) return <p className="text-sm text-muted-foreground py-8 text-center">No data available</p>;
  const w = 700;
  const h = height;
  const pad = { top: 20, right: 20, bottom: 40, left: 55 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const yMax = Math.max(...data.map((d) => Number(d[yKey]) || 0)) * 1.15 || 1;
  const xStep = plotW / (data.length - 1 || 1);

  const points = data.map((d, i) => ({
    x: pad.left + i * xStep,
    y: pad.top + plotH - ((Number(d[yKey]) || 0) / yMax) * plotH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${pad.top + plotH} L ${points[0].x} ${pad.top + plotH} Z`;

  const yTicks = 5;
  const gridLines = Array.from({ length: yTicks }, (_, i) => {
    const val = (yMax / (yTicks - 1)) * i;
    const y = pad.top + plotH - (val / yMax) * plotH;
    return { val, y };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={pad.left} y1={g.y} x2={w - pad.right} y2={g.y} stroke="#E2E8F0" strokeWidth={0.5} strokeDasharray="4 4" />
            <text x={pad.left - 8} y={g.y + 4} textAnchor="end" fontSize="10" fill="#94A3B8">
              {yMax > 100000 ? `₹${(g.val / 1000).toFixed(0)}k` : g.val >= 1000 ? `${(g.val / 1000).toFixed(1)}k` : String(Math.round(g.val))}
            </text>
          </g>
        ))}
        <path d={areaPath} fill={`url(#grad-${label})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="white" stroke={color} strokeWidth={2} />
            {i % 2 === 0 && (
              <text x={p.x} y={pad.top + plotH + 18} textAnchor="middle" fontSize="9" fill="#94A3B8">
                {String(data[i][xKey]).length > 8 ? String(data[i][xKey]).slice(0, 3) + ".." : String(data[i][xKey])}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function MultiLineChart({ data, xKey, lines, height = 240, label }: {
  data: Record<string, number | string>[];
  xKey: string;
  lines: { key: string; color: string; label: string }[];
  height?: number;
  label: string;
}) {
  if (!data.length) return <p className="text-sm text-muted-foreground py-8 text-center">No data available</p>;
  const w = 700; const h = height;
  const pad = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const allVals = data.flatMap((d) => lines.map((l) => Number(d[l.key]) || 0));
  const yMax = Math.max(...allVals) * 1.15 || 1;
  const xStep = plotW / (data.length - 1 || 1);

  const yTicks = 5;
  const gridLines = Array.from({ length: yTicks }, (_, i) => {
    const val = (yMax / (yTicks - 1)) * i;
    const y = pad.top + plotH - (val / yMax) * plotH;
    return { val, y };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={pad.left} y1={g.y} x2={w - pad.right} y2={g.y} stroke="#E2E8F0" strokeWidth={0.5} strokeDasharray="4 4" />
            <text x={pad.left - 8} y={g.y + 4} textAnchor="end" fontSize="10" fill="#94A3B8">
              {yMax > 10000 ? `${(g.val / 1000).toFixed(0)}k` : String(Math.round(g.val))}
            </text>
          </g>
        ))}
        {lines.map((line) => {
          const pts = data.map((d, i) => ({
            x: pad.left + i * xStep,
            y: pad.top + plotH - ((Number(d[line.key]) || 0) / yMax) * plotH,
          }));
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          return (
            <g key={line.key}>
              <polyline points={path} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="white" stroke={line.color} strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % 2 !== 0) return null;
          const x = pad.left + i * xStep;
          return (
            <text key={i} x={x} y={pad.top + plotH + 18} textAnchor="middle" fontSize="9" fill="#94A3B8">
              {String(d[xKey]).length > 8 ? String(d[xKey]).slice(0, 3) + ".." : String(d[xKey])}
            </text>
          );
        })}
      </svg>
      <SVGLegend items={lines.map((l) => ({ color: l.color, label: l.label }))} />
    </div>
  );
}

function HorizontalBarChart({ data, xKey, yKey, barColor, height = 300 }: {
  data: Record<string, number | string>[]; xKey: string; yKey: string; barColor: string; height?: number;
}) {
  if (!data.length) return <p className="text-sm text-muted-foreground py-8 text-center">No data available</p>;
  const w = 700; const h = height;
  const pad = { top: 10, right: 20, bottom: 10, left: 110 };
  const plotW = w - pad.left - pad.right;
  const barH = Math.min(24, (h - pad.top - pad.bottom) / data.length - 8);
  const maxVal = Math.max(...data.map((d) => Number(d[yKey]) || 0)) * 1.1 || 1;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {data.map((d, i) => {
          const y = pad.top + i * ((h - pad.top - pad.bottom) / data.length);
          const barW = ((Number(d[yKey]) || 0) / maxVal) * plotW;
          return (
            <g key={i}>
              <text x={pad.left - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="11" fill="#475569">
                {String(d[xKey]).length > 14 ? String(d[xKey]).slice(0, 14) + ".." : String(d[xKey])}
              </text>
              <rect x={pad.left} y={y} width={barW} height={barH} rx={4} fill={barColor} opacity={0.85} />
              <text x={pad.left + barW + 6} y={y + barH / 2 + 4} fontSize="10" fill="#64748B">
                {maxVal > 10000 ? formatINR(Number(d[yKey])) : Number(d[yKey]) >= 100 ? `${(Number(d[yKey]) as number).toFixed(1)}` : String(d[yKey])}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutChart({ data, xKey, yKey, size = 180, centerLabel }: {
  data: Record<string, number | string>[]; xKey: string; yKey: string; size?: number; centerLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + (Number(d[yKey]) || 0), 0);
  if (total === 0) return <p className="text-sm text-muted-foreground py-8 text-center">No data available</p>;
  const r = (size - 24) / 2;
  const circumference = 2 * Math.PI * r;
  const colors = ["#DC2626", "#16A34A", "#2563EB", "#D97706", "#7C3AED", "#EC4899", "#06B6D4", "#84CC16"];

  const segments = data.map((d, i) => {
    const pct = total > 0 ? (Number(d[yKey]) || 0) / total : 0;
    const prevPcts = data.slice(0, i).map((prev) => (Number(prev[yKey]) || 0) / total);
    const start = prevPcts.reduce((sum, p) => sum + p, 0);
    return { ...d, pct, start, color: colors[i % colors.length] };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={12} />
        {segments.map((seg, i) => {
          const offset = circumference * (0.25 + seg.start);
          const dashLen = circumference * seg.pct;
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth={12}
              strokeDasharray={`${dashLen} ${circumference - dashLen}`} strokeDashoffset={-offset} strokeLinecap="butt" />
          );
        })}
        {centerLabel && (
          <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize="18" fontWeight="bold" fill="#1E293B">{centerLabel}</text>
        )}
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize="10" fill="#94A3B8">Total</text>
      </svg>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="truncate">{String(seg[xKey])}</span>
            <span className="font-medium text-foreground">{(seg.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChartVertical({ data, xKey, yKey, barColor, height = 200 }: {
  data: Record<string, number | string>[]; xKey: string; yKey: string; barColor: string; height?: number;
}) {
  if (!data.length) return <p className="text-sm text-muted-foreground py-8 text-center">No data available</p>;
  const w = 700; const h = height;
  const pad = { top: 15, right: 10, bottom: 40, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const yMax = Math.max(...data.map((d) => Number(d[yKey]) || 0)) * 1.1 || 1;
  const barW = Math.max(4, plotW / data.length - 4);

  const yTicks = 4;
  const gridLines = Array.from({ length: yTicks }, (_, i) => {
    const val = (yMax / (yTicks - 1)) * i;
    const y = pad.top + plotH - (val / yMax) * plotH;
    return { val, y };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={pad.left} y1={g.y} x2={w - pad.right} y2={g.y} stroke="#E2E8F0" strokeWidth={0.5} strokeDasharray="4 4" />
            <text x={pad.left - 6} y={g.y + 4} textAnchor="end" fontSize="10" fill="#94A3B8">
              {g.val >= 1000 ? `${(g.val / 1000).toFixed(0)}k` : String(Math.round(g.val))}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + (i * plotW) / data.length + (plotW / data.length - barW) / 2;
          const barH2 = ((Number(d[yKey]) || 0) / yMax) * plotH;
          return (
            <g key={i}>
              <rect x={x} y={pad.top + plotH - barH2} width={barW} height={barH2} rx={2} fill={barColor} opacity={0.8} />
              {i % 3 === 0 && (
                <text x={x + barW / 2} y={pad.top + plotH + 16} textAnchor="middle" fontSize="8" fill="#94A3B8">{String(d[xKey])}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FunnelChart({ data }: { data: { stage: string; count: number }[] }) {
  if (!data.length || data.every((d) => d.count === 0)) return <p className="text-sm text-muted-foreground py-8 text-center">No data available</p>;
  const w = 500; const h = 200;
  const maxCount = data[0]?.count || 1;
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[400px]" preserveAspectRatio="xMidYMid meet">
        {data.map((d, i) => {
          const barW2 = Math.max(60, ((d.count / maxCount) * (w - 80)) + 80);
          const x = (w - barW2) / 2; const y = i * 44;
          const colors = ["#DC2626", "#D97706", "#2563EB", "#16A34A", "#7C3AED"];
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW2} height={36} rx={6} fill={colors[i % colors.length]} opacity={0.85} />
              <text x={w / 2} y={y + 23} textAnchor="middle" fontSize="12" fill="white" fontWeight="600">{d.stage} ({d.count})</text>
              {i < data.length - 1 && (
                <line x1={w / 2} y1={y + 36} x2={w / 2} y2={y + 44} stroke="#94A3B8" strokeWidth={1.5} markerEnd="url(#arrowhead2)" />
              )}
            </g>
          );
        })}
        <defs><marker id="arrowhead2" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#94A3B8" /></marker></defs>
      </svg>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div><Skeleton className="skeleton-wave h-8 w-48 mb-1" /><Skeleton className="skeleton-wave h-4 w-72" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="skeleton-wave h-80 rounded-xl" /><Skeleton className="skeleton-wave h-80 rounded-xl" />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <BarChart3 className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── Severity Badge Helper ──────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700 border-red-200",
    HIGH: "bg-orange-100 text-orange-700 border-orange-200",
    MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
    LOW: "bg-green-100 text-green-700 border-green-200",
    INFO: "bg-blue-100 text-blue-700 border-blue-200",
  };
  return <Badge variant="outline" className={`text-xs ${colors[severity] || "bg-gray-100 text-gray-700"}`}>{severity}</Badge>;
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const ALL_TABS = ["financial", "subscriber", "usage", "revenue", "network", "network_health", "accounting", "operations", "custom"] as const;

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("financial");
  const [period, setPeriod] = useState("month");
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [customStart, setCustomStart] = useState<Date>();
  const [customEnd, setCustomEnd] = useState<Date>();
  const [isCustom, setIsCustom] = useState(false);

  // Usage filters
  const [filterPlanId, setFilterPlanId] = useState("");
  const [filterAreaId, setFilterAreaId] = useState("");

  // Build query params
  const queryParams = new URLSearchParams({ tab: activeTab });
  if (isCustom && customStart && customEnd) {
    queryParams.set("startDate", customStart.toISOString());
    queryParams.set("endDate", customEnd.toISOString());
    queryParams.set("period", "custom");
  } else {
    queryParams.set("period", period);
  }
  if (filterPlanId) queryParams.set("planId", filterPlanId);
  if (filterAreaId) queryParams.set("areaId", filterAreaId);

  const { data, isLoading: loading, isFetching, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ["reports", activeTab, period, isCustom, customStart, customEnd, filterPlanId, filterAreaId],
    queryFn: () => apiFetch(`/api/reports?${queryParams.toString()}`),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const handlePeriodChange = useCallback((value: string) => {
    if (value === "custom") { setCustomDateOpen(true); return; }
    setIsCustom(false); setPeriod(value);
  }, []);

  const handleCustomApply = useCallback(() => {
    if (customStart && customEnd) { setIsCustom(true); setCustomDateOpen(false); }
  }, [customStart, customEnd]);

  const handleClearCustom = useCallback(() => {
    setIsCustom(false); setCustomStart(undefined); setCustomEnd(undefined); setPeriod("month");
  }, []);

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  // ─── CSV Export per tab ────────────────────────────────────
  const exportUsageCsv = useCallback(() => {
    const d = data || {};
    const rows: Record<string, unknown>[] = [];
    const stats = d.stats as Record<string, number> | undefined;
    rows.push({ Metric: "Total Usage (GB)", Value: stats?.totalUsageGB ?? 0 });
    rows.push({ Metric: "Download (GB)", Value: stats?.totalDownloadGB ?? 0 });
    rows.push({ Metric: "Upload (GB)", Value: stats?.totalUploadGB ?? 0 });
    rows.push({ Metric: "Unique Subscribers", Value: stats?.uniqueSubscribers ?? 0 });
    rows.push({ Metric: "Avg per Subscriber (GB)", Value: stats?.avgUsagePerSub ?? 0 });
    rows.push({});
    const consumers = (d.topConsumers as { name: string; plan: string; area: string; downloadGB: number; uploadGB: number; totalGB: number; avgSessionDuration: string }[]) || [];
    for (const c of consumers) rows.push({ Name: c.name, Plan: c.plan, Area: c.area, "DL (GB)": c.downloadGB, "UL (GB)": c.uploadGB, "Total (GB)": c.totalGB, "Avg Session": c.avgSessionDuration });
    downloadCsv("reports-usage.csv", ["Metric", "Value"], rows);
  }, [data]);

  const exportRevenueCsv = useCallback(() => {
    const d = data || {};
    const rows: Record<string, unknown>[] = [];
    const stats = d.stats as Record<string, number> | undefined;
    rows.push({ Metric: "MRR", Value: stats?.mrr ?? 0 });
    rows.push({ Metric: "ARPU", Value: stats?.arpu ?? 0 });
    rows.push({ Metric: "Collection Efficiency %", Value: stats?.collectionEfficiency ?? 0 });
    rows.push({ Metric: "Total Revenue", Value: stats?.totalRevenue ?? 0 });
    rows.push({});
    const trend = (d.monthlyTrend as { month: string; revenue: number; collected: number; collectionRate: number }[]) || [];
    for (const t of trend) rows.push({ Month: t.month, Revenue: t.revenue, Collected: t.collected, "Collection %": t.collectionRate });
    downloadCsv("reports-revenue-analytics.csv", ["Metric", "Value"], rows);
  }, [data]);

  const exportNetworkHealthCsv = useCallback(() => {
    const d = data || {};
    const rows: Record<string, unknown>[] = [];
    const stats = d.stats as Record<string, number> | undefined;
    rows.push({ Metric: "Avg Uptime %", Value: stats?.avgUptime ?? 0 });
    rows.push({ Metric: "Total Devices", Value: stats?.totalDevices ?? 0 });
    rows.push({ Metric: "Online", Value: stats?.onlineDevices ?? 0 });
    rows.push({ Metric: "Offline", Value: stats?.offlineDevices ?? 0 });
    rows.push({ Metric: "SLA Compliance %", Value: stats?.slaCompliance ?? 0 });
    rows.push({ Metric: "Critical Alerts", Value: stats?.criticalAlerts ?? 0 });
    rows.push({});
    const devStats = (d.deviceUptimeStats as { name: string; type: string; status: string; uptime: number; cpuUsage: number; memoryUsage: number }[]) || [];
    for (const dev of devStats) rows.push({ Device: dev.name, Type: dev.type, Status: dev.status, "Uptime %": dev.uptime, "CPU %": dev.cpuUsage, "Memory %": dev.memoryUsage });
    downloadCsv("reports-network-health.csv", ["Metric", "Value"], rows);
  }, [data]);

  const exportAccountingCsv = useCallback(() => {
    const d = data || {};
    const rows: Record<string, unknown>[] = [];
    const stats = d.stats as Record<string, number | string> | undefined;
    rows.push({ Metric: "Total Sessions", Value: stats?.totalSessions ?? 0 });
    rows.push({ Metric: "Success Rate %", Value: stats?.successRate ?? 0 });
    rows.push({ Metric: "Active Sessions", Value: stats?.activeSessions ?? 0 });
    rows.push({ Metric: "Avg Duration", Value: stats?.avgSessionDuration ?? "0" });
    rows.push({ Metric: "Unique NAS Devices", Value: stats?.uniqueNasDevices ?? 0 });
    rows.push({});
    const nas = (d.topNasDevices as { nasIp: string; sessions: number; avgDuration: string; totalGB: number }[]) || [];
    for (const n of nas) rows.push({ "NAS IP": n.nasIp, Sessions: n.sessions, "Avg Duration": n.avgDuration, "Total (GB)": n.totalGB });
    downloadCsv("reports-radius-accounting.csv", ["Metric", "Value"], rows);
  }, [data]);

  const exportFinancialCsv = useCallback(() => {
    const d = data || {};
    const stats = d.stats as Record<string, number> | undefined;
    const rows: Record<string, unknown>[] = [];
    rows.push({ Metric: "Total Revenue", Value: stats?.totalRevenue ?? 0 });
    rows.push({ Metric: "Outstanding", Value: stats?.outstanding ?? 0 });
    rows.push({ Metric: "Collection Rate %", Value: stats?.collectionRate ?? 0 });
    rows.push({ Metric: "ARPU", Value: stats?.arpu ?? 0 });
    rows.push({});
    const trend = (d.monthlyRevenueTrend as Record<string, string | number>[]) || [];
    for (const t of trend) rows.push({ Month: t.month, Revenue: t.revenue, Collected: t.collected });
    downloadCsv("reports-financial.csv", ["Metric", "Value"], rows);
  }, [data]);

  const exportSubscriberCsv = useCallback(() => {
    const d = data || {};
    const stats = d.stats as Record<string, number> | undefined;
    const rows: Record<string, unknown>[] = [];
    rows.push({ Metric: "Total Active", Value: stats?.totalActive ?? 0 });
    rows.push({ Metric: "New This Month", Value: stats?.newThisMonth ?? 0 });
    rows.push({ Metric: "Churned", Value: stats?.churnedThisMonth ?? 0 });
    downloadCsv("reports-subscriber.csv", ["Metric", "Value"], rows);
  }, [data]);

  const exportNetworkCsv = useCallback(() => {
    const d = data || {};
    const rows: Record<string, unknown>[] = [];
    const users = (d.topBandwidthUsers as { name: string; plan: string; download: number; upload: number; total: number }[]) || [];
    for (const u of users) rows.push({ Subscriber: u.name, Plan: u.plan, "Download (GB)": u.download, "Upload (GB)": u.upload, "Total (GB)": u.total });
    downloadCsv("reports-network.csv", ["Metric", "Value"], rows);
  }, [data]);

  const exportOperationsCsv = useCallback(() => {
    const d = data || {};
    const rows: Record<string, unknown>[] = [];
    const summary = (d.monthlyOperationsSummary as { month: string; connections: number; complaints: number; revenue: number }[]) || [];
    for (const m of summary) rows.push({ Month: m.month, Connections: m.connections, Complaints: m.complaints, Revenue: m.revenue });
    downloadCsv("reports-operations.csv", ["Metric", "Value"], rows);
  }, [data]);

  const exportCurrentTab = useCallback(() => {
    switch (activeTab) {
      case "financial": exportFinancialCsv(); break;
      case "subscriber": exportSubscriberCsv(); break;
      case "usage": exportUsageCsv(); break;
      case "revenue": exportRevenueCsv(); break;
      case "network": exportNetworkCsv(); break;
      case "network_health": exportNetworkHealthCsv(); break;
      case "accounting": exportAccountingCsv(); break;
      case "operations": exportOperationsCsv(); break;
    }
  }, [activeTab, exportFinancialCsv, exportSubscriberCsv, exportUsageCsv, exportRevenueCsv, exportNetworkCsv, exportNetworkHealthCsv, exportAccountingCsv, exportOperationsCsv]);

  const d = data || {};

  // ─── Custom Report State ────────────────────────────────
  const [customSource, setCustomSource] = useState("subscribers");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<Record<string, string>>({});
  const [customFilterDefs, setCustomFilterDefs] = useState<{ label: string; field: string; type: string; options?: string[] }[]>([]);
  const [customColumnDefs, setCustomColumnDefs] = useState<{ label: string; field: string }[]>([]);
  const [customPage, setCustomPage] = useState(1);

  const { data: customMeta } = useQuery<{ columns: { label: string; field: string }[]; filters: { label: string; field: string; type: string; options?: string[] }[] }>({
    queryKey: ["custom-report-meta", customSource],
    queryFn: () => apiFetch(`/api/reports/custom?meta=true&source=${customSource}`),
    enabled: activeTab === "custom",
  });

  // Sync custom report metadata into local state when loaded
  const prevColumnMetaRef = useRef<string | null>(null);
  useEffect(() => {
    if (customMeta?.columns && customMeta.columns.length > 0 && customColumns.length === 0 && prevColumnMetaRef.current !== customSource) {
      prevColumnMetaRef.current = customSource;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing external query metadata into local state
      setCustomColumns(customMeta.columns.map((c) => c.field));
      setCustomColumnDefs(customMeta.columns || []);
      setCustomFilterDefs(customMeta.filters || []);
    }
  }, [customMeta, customSource, customColumns.length]);

  const { data: customData, isLoading: customLoading } = useQuery<{
    rows: Record<string, unknown>[]; headers: string[]; total: number; page: number; limit: number; totalPages: number;
  }>({
    queryKey: ["custom-report", customSource, customStartDate, customEndDate, customColumns, customFilters],
    queryFn: () => {
      const params = new URLSearchParams({ source: customSource });
      if (customStartDate) params.set("startDate", new Date(customStartDate).toISOString());
      if (customEndDate) params.set("endDate", new Date(customEndDate).toISOString());
      if (customColumns.length > 0) params.set("columns", customColumns.join(","));
      if (Object.keys(customFilters).length > 0) params.set("filters", JSON.stringify(customFilters));
      return apiFetch(`/api/reports/custom?${params.toString()}`);
    },
    enabled: !!(activeTab === "custom" && customColumns.length > 0 && customStartDate && customEndDate),
  });

  function toggleCustomColumn(field: string) {
    setCustomColumns((prev) => prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]);
  }

  // ─── SUBSCRIBER USAGE TAB ────────────────────────────────
  const renderUsage = () => {
    if (loading) return <LoadingSkeleton />;
    const stats = d.stats as Record<string, number> | undefined;
    const filters = d.filters as { plans: { id: string; name: string }[]; areas: { id: string; name: string }[] } | undefined;

    return (
      <div className="space-y-6">
        {/* Filters */}
        <Card className="animate-card-enter border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Plan</Label>
                <Select value={filterPlanId} onValueChange={(v) => setFilterPlanId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="All Plans" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Plans</SelectItem>
                    {(filters?.plans || []).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Area</Label>
                <Select value={filterAreaId} onValueChange={(v) => setFilterAreaId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="All Areas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Areas</SelectItem>
                    {(filters?.areas || []).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(filterPlanId || filterAreaId) && (
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setFilterPlanId(""); setFilterAreaId(""); }}>
                    <X className="h-3 w-3 mr-1" /> Clear Filters
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Download} label="Total Usage" value={`${stats?.totalUsageGB ?? 0} GB`} gradient="stat-gradient-purple" delay={0} />
          <StatCard icon={ArrowUpRight} label="Total Download" value={`${stats?.totalDownloadGB ?? 0} GB`} gradient="stat-gradient-blue" delay={75} />
          <StatCard icon={ArrowDownRight} label="Total Upload" value={`${stats?.totalUploadGB ?? 0} GB`} gradient="stat-gradient-green" delay={150} />
          <StatCard icon={Users} label="Avg per Subscriber" value={`${stats?.avgUsagePerSub ?? 0} GB`} gradient="stat-gradient-amber" delay={225} sub={`${stats?.uniqueSubscribers ?? 0} subscribers`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Usage by Plan */}
          <Card className="animate-card-enter">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wifi className="h-4 w-4 text-[#7C3AED]" /> Usage by Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart data={((d.usageByPlan as Record<string, string | number>[]) || []).map(p => ({ plan: p.plan, totalGB: p.totalGB }))} xKey="plan" yKey="totalGB" barColor="#7C3AED" height={260} />
            </CardContent>
          </Card>

          {/* Usage by Area */}
          <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-[#16A34A]" /> Usage by Area
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart data={((d.usageByArea as Record<string, string | number>[]) || []).map(a => ({ area: a.area, totalGB: a.totalGB }))} xKey="area" yKey="totalGB" barColor="#16A34A" height={260} />
            </CardContent>
          </Card>
        </div>

        {/* Top Consumers Table */}
        <Card className="animate-card-enter" style={{ animationDelay: "200ms" }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-[#DC2626]" /> Top Data Consumers
              </CardTitle>
              <Badge variant="outline" className="text-xs">{((d.topConsumers as unknown[]) || []).length} subscribers</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Subscriber</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Connection</TableHead>
                    <TableHead className="text-right">Download (GB)</TableHead>
                    <TableHead className="text-right">Upload (GB)</TableHead>
                    <TableHead className="text-right">Total (GB)</TableHead>
                    <TableHead className="text-right">Avg Session</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((d.topConsumers as { name: string; plan: string; area: string; connectionType: string; downloadGB: number; uploadGB: number; totalGB: number; avgSessionDuration: string }[]) || []).length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No usage data found for this period</TableCell></TableRow>
                  )}
                  {((d.topConsumers as { name: string; plan: string; area: string; connectionType: string; downloadGB: number; uploadGB: number; totalGB: number; avgSessionDuration: string }[]) || []).map((u, i) => (
                    <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                      <TableCell className="font-semibold text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{u.plan}</Badge></TableCell>
                      <TableCell className="text-xs">{u.area}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{u.connectionType}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums text-teal-600 font-medium">{u.downloadGB}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600 font-medium">{u.uploadGB}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{u.totalGB}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{u.avgSessionDuration}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── REVENUE ANALYTICS TAB ───────────────────────────────
  const renderRevenue = () => {
    if (loading) return <LoadingSkeleton />;
    const stats = d.stats as Record<string, number> | undefined;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp} label="MRR" value={formatINR(stats?.mrr ?? 0)} gradient="stat-gradient-green" delay={0} sub="Monthly Recurring Revenue" />
          <StatCard icon={Users} label="ARPU" value={formatINR(stats?.arpu ?? 0)} gradient="stat-gradient-blue" delay={75} sub="Per active subscriber" />
          <StatCard icon={Target} label="Collection Efficiency" value={`${stats?.collectionEfficiency ?? 0}%`} gradient="stat-gradient-purple" delay={150} />
          <StatCard icon={DollarSign} label="Period Revenue" value={formatINR(stats?.totalRevenue ?? 0)} gradient="stat-gradient-red" delay={225} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="animate-card-enter">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#16A34A]" /> Monthly Revenue & Collection Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MultiLineChart
                data={((d.monthlyTrend as Record<string, string | number>[]) || []).map(t => ({ month: t.month, revenue: Number(t.revenue), collected: Number(t.collected) }))}
                xKey="month" lines={[
                  { key: "revenue", color: "#16A34A", label: "Revenue" },
                  { key: "collected", color: "#DC2626", label: "Collected" },
                ]} height={280} label="revenue-trend"
              />
            </CardContent>
          </Card>

          <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#7C3AED]" /> Revenue by Plan Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart data={((d.planWiseRevenue as Record<string, string | number>[]) || []).map(p => ({ plan: p.plan, revenue: p.revenue }))} xKey="plan" yKey="revenue" size={220} centerLabel="₹" />
            </CardContent>
          </Card>

          <Card className="animate-card-enter" style={{ animationDelay: "200ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wifi className="h-4 w-4 text-[#2563EB]" /> Revenue by Connection Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart data={((d.revenueByConnectionType as Record<string, string | number>[]) || []).map(c => ({ type: c.type, revenue: c.revenue }))} xKey="type" yKey="revenue" barColor="#2563EB" height={260} />
            </CardContent>
          </Card>

          <Card className="animate-card-enter" style={{ animationDelay: "300ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-[#D97706]" /> ARPU Trend (6 Months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AreaChart data={((d.arpuTrend as Record<string, string | number>[]) || []).map(a => ({ month: a.month, arpu: Number(a.arpu) }))} xKey="month" yKey="arpu" color="#D97706" label="arpu" height={260} />
            </CardContent>
          </Card>
        </div>

        {/* Monthly Revenue Table */}
        <Card className="animate-card-enter" style={{ animationDelay: "350ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[#DC2626]" /> Monthly Revenue Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Collection %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((d.monthlyTrend as { month: string; revenue: number; collected: number; invoices: number; collectionRate: number }[]) || []).map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatINR(row.revenue)}</TableCell>
                      <TableCell className="text-right text-green-600 tabular-nums">{formatINR(row.collected)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.invoices}</TableCell>
                      <TableCell className="text-right">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${row.collectionRate >= 90 ? "bg-green-100 text-green-700" : row.collectionRate >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                          {row.collectionRate}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── NETWORK HEALTH TAB ──────────────────────────────────
  const renderNetworkHealth = () => {
    if (loading) return <LoadingSkeleton />;
    const stats = d.stats as Record<string, number> | undefined;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Activity} label="Avg Uptime" value={`${stats?.avgUptime ?? 0}%`} gradient="stat-gradient-green" delay={0} />
          <StatCard icon={Server} label="Online / Total" value={`${stats?.onlineDevices ?? 0} / ${stats?.totalDevices ?? 0}`} gradient="stat-gradient-blue" delay={75} />
          <StatCard icon={AlertTriangle} label="Critical Alerts" value={String(stats?.criticalAlerts ?? 0)} gradient="stat-gradient-red" delay={150} />
          <StatCard icon={Target} label="SLA Compliance" value={`${stats?.slaCompliance ?? 0}%`} gradient="stat-gradient-purple" delay={225} sub={`Target: ${stats?.slaTarget ?? 99.5}%`} />
        </div>

        {/* Device Status Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="animate-card-enter bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-sm text-muted-foreground">Online</p><p className="text-xl font-bold text-green-600 tabular-nums">{stats?.onlineDevices ?? 0}</p></div>
            </CardContent>
          </Card>
          <Card className="animate-card-enter bg-gradient-to-br from-red-50 to-rose-50 border-red-100" style={{ animationDelay: "75ms" }}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0"><XCircle className="h-5 w-5 text-red-600" /></div>
              <div><p className="text-sm text-muted-foreground">Offline</p><p className="text-xl font-bold text-red-600 tabular-nums">{stats?.offlineDevices ?? 0}</p></div>
            </CardContent>
          </Card>
          <Card className="animate-card-enter bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-100" style={{ animationDelay: "150ms" }}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
              <div><p className="text-sm text-muted-foreground">Warning</p><p className="text-xl font-bold text-amber-600 tabular-nums">{stats?.warningDevices ?? 0}</p></div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Device Uptime Table */}
          <Card className="animate-card-enter">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#16A34A]" /> Device Uptime Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Uptime %</TableHead>
                      <TableHead className="text-right">CPU</TableHead>
                      <TableHead className="text-right">Memory</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((d.deviceUptimeStats as { name: string; type: string; status: string; uptime: number; cpuUsage: number; memoryUsage: number }[]) || []).length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No devices found</TableCell></TableRow>
                    )}
                    {((d.deviceUptimeStats as { name: string; type: string; status: string; uptime: number; cpuUsage: number; memoryUsage: number }[]) || []).map((row, i) => {
                      const statusColor = row.status === "ONLINE" ? "bg-green-100 text-green-700" : row.status === "OFFLINE" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
                      return (
                        <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell className="font-medium text-xs">{row.name}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{row.type}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className={`text-xs ${statusColor}`}>{row.status}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={`text-xs font-semibold ${row.uptime > 99 ? "text-green-600" : row.uptime > 95 ? "text-amber-600" : "text-red-600"}`}>{row.uptime.toFixed(2)}%</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{row.cpuUsage.toFixed(1)}%</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{row.memoryUsage.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Bandwidth Utilization by Link */}
          <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Gauge className="h-4 w-4 text-[#2563EB]" /> Bandwidth Utilization by Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Interface</TableHead>
                      <TableHead className="text-right">DL (Mbps)</TableHead>
                      <TableHead className="text-right">UL (Mbps)</TableHead>
                      <TableHead className="text-right">Total (Mbps)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((d.bandwidthByLink as { device: string; interface: string; downloadMbps: number; uploadMbps: number; totalMbps: number }[]) || []).length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No bandwidth data</TableCell></TableRow>
                    )}
                    {((d.bandwidthByLink as { device: string; interface: string; downloadMbps: number; uploadMbps: number; totalMbps: number }[]) || []).map((row, i) => (
                      <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="font-medium text-xs">{row.device}</TableCell>
                        <TableCell className="text-xs">{row.interface}</TableCell>
                        <TableCell className="text-right tabular-nums text-teal-600 text-xs">{row.downloadMbps}</TableCell>
                        <TableCell className="text-right tabular-nums text-green-600 text-xs">{row.uploadMbps}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-xs">{row.totalMbps}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Critical Alerts Summary */}
          <Card className="animate-card-enter" style={{ animationDelay: "200ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#DC2626]" /> Alert Summary by Severity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart data={((d.alertSummary as Record<string, string | number>[]) || []).map(a => ({ severity: a.severity, count: a.count }))} xKey="severity" yKey="count" size={200} centerLabel={String(stats?.totalAlerts ?? 0)} />
            </CardContent>
          </Card>

          {/* SLA Compliance Card */}
          <Card className="animate-card-enter" style={{ animationDelay: "300ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#7C3AED]" /> SLA Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100 p-6 text-center">
                <p className="text-sm text-muted-foreground">Current Uptime vs SLA Target</p>
                <div className="flex items-center justify-center gap-4 mt-3">
                  <div>
                    <p className="text-3xl font-bold text-[#7C3AED] tabular-nums">{stats?.slaCompliance ?? 0}%</p>
                    <p className="text-xs text-muted-foreground">Actual</p>
                  </div>
                  <span className="text-2xl text-muted-foreground">/</span>
                  <div>
                    <p className="text-3xl font-bold text-gray-500 tabular-nums">{stats?.slaTarget ?? 99.5}%</p>
                    <p className="text-xs text-muted-foreground">Target</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Progress value={Number(stats?.slaCompliance ?? 0)} className="h-2.5 [&>div]:bg-[#7C3AED]" />
                </div>
                <Badge className={`mt-2 ${Number(stats?.slaCompliance ?? 0) >= Number(stats?.slaTarget ?? 99.5) ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {Number(stats?.slaCompliance ?? 0) >= Number(stats?.slaTarget ?? 99.5) ? "SLA Met" : "SLA Breached"}
                </Badge>
              </div>
              {/* Recent Alerts */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Recent Alerts</p>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {((d.recentAlerts as { title: string; severity: string; status: string; createdAt: string }[]) || []).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No alerts in this period</p>
                  )}
                  {((d.recentAlerts as { title: string; severity: string; status: string; createdAt: string }[]) || []).map((alert, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <SeverityBadge severity={alert.severity} />
                        <span className="text-xs truncate">{alert.title}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{alert.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ─── RADIUS ACCOUNTING TAB ───────────────────────────────
  const renderAccounting = () => {
    if (loading) return <LoadingSkeleton />;
    const stats = d.stats as Record<string, number | string> | undefined;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Radio} label="Total Sessions" value={formatNum(Number(stats?.totalSessions ?? 0))} gradient="stat-gradient-blue" delay={0} />
          <StatCard icon={CheckCircle2} label="Success Rate" value={`${stats?.successRate ?? 0}%`} gradient="stat-gradient-green" delay={75} />
          <StatCard icon={Timer} label="Avg Session Duration" value={String(stats?.avgSessionDuration ?? "0m")} gradient="stat-gradient-amber" delay={150} />
          <StatCard icon={Server} label="NAS Devices" value={formatNum(Number(stats?.uniqueNasDevices ?? 0))} gradient="stat-gradient-purple" delay={225} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="animate-card-enter bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-sm text-muted-foreground">Successful</p><p className="text-xl font-bold text-green-600 tabular-nums">{formatNum(Number(stats?.successfulSessions ?? 0))}</p></div>
            </CardContent>
          </Card>
          <Card className="animate-card-enter bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-100" style={{ animationDelay: "75ms" }}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0"><Radio className="h-5 w-5 text-blue-600" /></div>
              <div><p className="text-sm text-muted-foreground">Active Now</p><p className="text-xl font-bold text-blue-600 tabular-nums">{formatNum(Number(stats?.activeSessions ?? 0))}</p></div>
            </CardContent>
          </Card>
          <Card className="animate-card-enter bg-gradient-to-br from-purple-50 to-violet-50 border-purple-100" style={{ animationDelay: "150ms" }}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0"><HardDrive className="h-5 w-5 text-purple-600" /></div>
              <div><p className="text-sm text-muted-foreground">Accounting Logs</p><p className="text-xl font-bold text-purple-600 tabular-nums">{formatNum(Number(stats?.totalAccountingLogs ?? 0))}</p></div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Session Duration Distribution */}
          <Card className="animate-card-enter">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#2563EB]" /> Session Duration Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChartVertical data={((d.sessionDurationDistribution as Record<string, string | number>[]) || []).map(s => ({ range: s.range, count: s.count }))} xKey="range" yKey="count" barColor="#2563EB" height={240} />
            </CardContent>
          </Card>

          {/* Terminate Cause Distribution */}
          <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <XCircle className="h-4 w-4 text-[#DC2626]" /> Terminate Cause Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart data={((d.terminateCauseDistribution as Record<string, string | number>[]) || []).map(t => ({ cause: t.cause, count: t.count }))} xKey="cause" yKey="count" size={200} centerLabel={String(stats?.totalSessions ?? 0)} />
            </CardContent>
          </Card>

          {/* Top NAS Devices */}
          <Card className="animate-card-enter lg:col-span-2" style={{ animationDelay: "200ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Server className="h-4 w-4 text-[#7C3AED]" /> Top NAS Devices by Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>NAS IP</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Total Duration</TableHead>
                      <TableHead className="text-right">Avg Duration</TableHead>
                      <TableHead className="text-right">Download (GB)</TableHead>
                      <TableHead className="text-right">Upload (GB)</TableHead>
                      <TableHead className="text-right">Total (GB)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((d.topNasDevices as { nasIp: string; sessions: number; totalDuration: string; avgDuration: string; downloadGB: number; uploadGB: number; totalGB: number }[]) || []).length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No RADIUS data found</TableCell></TableRow>
                    )}
                    {((d.topNasDevices as { nasIp: string; sessions: number; totalDuration: string; avgDuration: string; downloadGB: number; uploadGB: number; totalGB: number }[]) || []).map((n, i) => (
                      <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="font-semibold text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{n.nasIp}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{n.sessions}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{n.totalDuration}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{n.avgDuration}</TableCell>
                        <TableCell className="text-right tabular-nums text-teal-600">{n.downloadGB}</TableCell>
                        <TableCell className="text-right tabular-nums text-green-600">{n.uploadGB}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{n.totalGB}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ─── FINANCIAL TAB ─────────────────────────────────────────
  const renderFinancial = () => {
    if (loading) return <LoadingSkeleton />;
    const stats = d.stats as Record<string, number> | undefined;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={DollarSign} label="Total Revenue" value={formatINR(stats?.totalRevenue ?? 0)} gradient="stat-gradient-red" delay={0} />
          <StatCard icon={DollarSign} label="Outstanding" value={formatINR(stats?.outstanding ?? 0)} gradient="stat-gradient-amber" delay={75} />
          <StatCard icon={AlertTriangle} label="Overdue Total" value={formatINR(stats?.overdueTotal ?? 0)} gradient="stat-gradient-red" delay={100} sub="All-time overdue invoices" />
          <StatCard icon={Target} label="Collection Rate" value={`${stats?.collectionRate ?? 0}%`} gradient="stat-gradient-green" delay={150} />
          <StatCard icon={Users} label="ARPU" value={formatINR(stats?.arpu ?? 0)} gradient="stat-gradient-blue" delay={225} sub="Per active subscriber" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="animate-card-enter"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#16A34A]" /> Monthly Revenue Trend</CardTitle></CardHeader><CardContent><AreaChart data={(d.monthlyRevenueTrend as Record<string, string | number>[]) || []} xKey="month" yKey="revenue" color="#16A34A" label="revenue" height={260} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#DC2626]" /> Revenue by Plan</CardTitle></CardHeader><CardContent><HorizontalBarChart data={(d.revenueByPlan as Record<string, string | number>[]) || []} xKey="plan" yKey="revenue" barColor="#DC2626" height={280} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "200ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#2563EB]" /> Revenue by Area</CardTitle></CardHeader><CardContent><HorizontalBarChart data={(d.revenueByArea as Record<string, string | number>[]) || []} xKey="area" yKey="revenue" barColor="#2563EB" height={280} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "300ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-[#7C3AED]" /> Payment Mode Breakdown</CardTitle></CardHeader><CardContent className="flex justify-center"><DonutChart data={(d.paymentModeBreakdown as Record<string, string | number>[]) || []} xKey="mode" yKey="amount" size={220} centerLabel="₹" /></CardContent></Card>
        </div>
        <Card className="animate-card-enter" style={{ animationDelay: "350ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Receipt className="h-4 w-4 text-[#D97706]" /> GST Summary</CardTitle></CardHeader><CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 p-4 text-center"><p className="text-sm text-muted-foreground">CGST Collected</p><p className="text-xl font-bold text-[#D97706] mt-1">{formatINR((d.gst as Record<string, number>)?.cgst ?? 0)}</p></div>
            <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 p-4 text-center"><p className="text-sm text-muted-foreground">SGST Collected</p><p className="text-xl font-bold text-[#16A34A] mt-1">{formatINR((d.gst as Record<string, number>)?.sgst ?? 0)}</p></div>
            <div className="rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100 p-4 text-center"><p className="text-sm text-muted-foreground">IGST Collected</p><p className="text-xl font-bold text-[#2563EB] mt-1">{formatINR((d.gst as Record<string, number>)?.igst ?? 0)}</p></div>
          </div>
        </CardContent></Card>
      </div>
    );
  };

  // ─── SUBSCRIBER TAB ────────────────────────────────────────
  const renderSubscriber = () => {
    if (loading) return <LoadingSkeleton />;
    const stats = d.stats as Record<string, number> | undefined;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Active" value={formatNum(stats?.totalActive ?? 0)} gradient="stat-gradient-blue" delay={0} />
          <StatCard icon={ArrowUpRight} label="New This Period" value={formatNum(stats?.newThisMonth ?? 0)} gradient="stat-gradient-green" delay={75} />
          <StatCard icon={ArrowDownRight} label="Churned This Period" value={formatNum(stats?.churnedThisMonth ?? 0)} gradient="stat-gradient-red" delay={150} />
          <StatCard icon={TrendingUp} label="Net Growth" value={`${stats?.netGrowth ?? 0 >= 0 ? "+" : ""}${stats?.netGrowth ?? 0}`} gradient="stat-gradient-purple" delay={225} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="animate-card-enter"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#2563EB]" /> Subscriber Growth Trend</CardTitle></CardHeader><CardContent><MultiLineChart data={(d.growthTrend as Record<string, string | number>[]) || []} xKey="month" lines={[{ key: "active", color: "#2563EB", label: "Active" }, { key: "newSubs", color: "#16A34A", label: "New" }, { key: "churned", color: "#DC2626", label: "Churned" }]} height={280} label="subscriber-growth" /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Wifi className="h-4 w-4 text-[#DC2626]" /> Connection Type Distribution</CardTitle></CardHeader><CardContent className="flex justify-center"><DonutChart data={(d.planDistribution as Record<string, string | number>[]) || []} xKey="type" yKey="count" size={220} centerLabel={formatNum(stats?.totalActive ?? 0)} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "200ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-[#16A34A]" /> Conversion Funnel</CardTitle></CardHeader><CardContent className="flex justify-center"><FunnelChart data={(d.trialConversion as { stage: string; count: number }[]) || []} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "300ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#D97706]" /> Top Growth Areas</CardTitle></CardHeader><CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {((d.topGrowthAreas as { area: string; growth: number; newSubs: number }[]) || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No growth data for this period</p>}
              {((d.topGrowthAreas as { area: string; growth: number; newSubs: number }[]) || []).map((a, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3"><span className="text-sm font-semibold text-muted-foreground w-6">#{i + 1}</span><span className="text-sm font-medium">{a.area}</span></div>
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">+{a.newSubs} subs</span><Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">+{a.growth}%</Badge></div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </div>
        <Card className="animate-card-enter" style={{ animationDelay: "350ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-[#7C3AED]" /> Area-wise Distribution</CardTitle></CardHeader><CardContent>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Area</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Active</TableHead><TableHead className="text-right">Suspended</TableHead><TableHead className="text-right">Active %</TableHead></TableRow></TableHeader><TableBody>
            {((d.areaWiseDistribution as { area: string; total: number; active: number; suspended: number }[]) || []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No area data</TableCell></TableRow>}
            {((d.areaWiseDistribution as { area: string; total: number; active: number; suspended: number }[]) || []).map((row, i) => (
              <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-medium">{row.area}</TableCell><TableCell className="text-right">{formatNum(row.total)}</TableCell><TableCell className="text-right"><span className="text-green-600 font-medium">{formatNum(row.active)}</span></TableCell><TableCell className="text-right"><span className="text-amber-600">{formatNum(row.suspended)}</span></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-2"><Progress value={(row.active / row.total) * 100} className="w-16 h-2" /><span className="text-xs text-muted-foreground">{((row.active / row.total) * 100).toFixed(1)}%</span></div></TableCell></TableRow>
            ))}
          </TableBody></Table></div>
        </CardContent></Card>
      </div>
    );
  };

  // ─── NETWORK TAB ───────────────────────────────────────────
  const renderNetwork = () => {
    if (loading) return <LoadingSkeleton />;
    const stats = d.stats as Record<string, number> | undefined;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Activity} label="Avg Uptime" value={`${stats?.avgUptime ?? 0}%`} gradient="stat-gradient-green" delay={0} />
          <StatCard icon={Wifi} label="Total Devices" value={formatNum(stats?.totalDevices ?? 0)} gradient="stat-gradient-blue" delay={75} />
          <StatCard icon={Download} label="Total Bandwidth" value={`${stats?.totalBandwidth ?? 0} TB`} gradient="stat-gradient-purple" delay={100} />
          <StatCard icon={Users} label="Peak Concurrent" value={formatNum(stats?.peakConcurrent ?? 0)} gradient="stat-gradient-amber" delay={150} />
          <StatCard icon={AlertTriangle} label="Alerts" value={formatNum(stats?.totalAlerts ?? 0)} gradient="stat-gradient-red" delay={200} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="animate-card-enter"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-[#16A34A]" /> Device Status</CardTitle></CardHeader><CardContent className="flex justify-center"><DonutChart data={(d.deviceStatusDistribution as Record<string, string | number>[]) || []} xKey="status" yKey="count" size={200} centerLabel={String(stats?.totalDevices ?? 0)} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Wifi className="h-4 w-4 text-[#7C3AED]" /> Device Types</CardTitle></CardHeader><CardContent><HorizontalBarChart data={(d.deviceTypeBreakdown as Record<string, string | number>[]) || []} xKey="type" yKey="count" barColor="#7C3AED" height={280} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "200ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Download className="h-4 w-4 text-[#2563EB]" /> Bandwidth by Area</CardTitle></CardHeader><CardContent><HorizontalBarChart data={(d.bandwidthByArea as Record<string, string | number>[]) || []} xKey="area" yKey="tb" barColor="#2563EB" height={300} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "300ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-[#DC2626]" /> Peak Usage Hours</CardTitle></CardHeader><CardContent><BarChartVertical data={(d.peakUsageHours as Record<string, string | number>[]) || []} xKey="hour" yKey="users" barColor="#DC2626" height={220} /><SVGLegend items={[{ color: "#DC2626", label: "Active Users" }]} /></CardContent></Card>
        </div>
        <Card className="animate-card-enter" style={{ animationDelay: "350ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-[#7C3AED]" /> Top 10 Bandwidth Users</CardTitle></CardHeader><CardContent>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-8">#</TableHead><TableHead>Subscriber</TableHead><TableHead>Plan</TableHead><TableHead className="text-right">Download (GB)</TableHead><TableHead className="text-right">Upload (GB)</TableHead><TableHead className="text-right">Total (GB)</TableHead></TableRow></TableHeader><TableBody>
            {((d.topBandwidthUsers as { name: string; plan: string; download: number; upload: number; total: number }[]) || []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No usage data</TableCell></TableRow>}
            {((d.topBandwidthUsers as { name: string; plan: string; download: number; upload: number; total: number }[]) || []).map((u, i) => (
              <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-semibold text-muted-foreground">{i + 1}</TableCell><TableCell className="font-medium">{u.name}</TableCell><TableCell><Badge variant="secondary" className="text-xs">{u.plan}</Badge></TableCell><TableCell className="text-right text-teal-600 font-medium">{u.download}</TableCell><TableCell className="text-right text-green-600 font-medium">{u.upload}</TableCell><TableCell className="text-right font-bold">{u.total}</TableCell></TableRow>
            ))}
          </TableBody></Table></div>
        </CardContent></Card>
      </div>
    );
  };

  // ─── OPERATIONS TAB ────────────────────────────────────────
  const renderOperations = () => {
    if (loading) return <LoadingSkeleton />;
    const stats = d.stats as Record<string, number | string> | undefined;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Wrench} label="Total Complaints" value={formatNum(Number(stats?.totalComplaints) ?? 0)} gradient="stat-gradient-red" delay={0} />
          <StatCard icon={Clock} label="Avg Resolution Time" value={String(stats?.avgResolutionTime ?? "0")} gradient="stat-gradient-blue" delay={75} />
          <StatCard icon={Target} label="SLA Compliance" value={`${stats?.slaCompliance ?? 0}%`} gradient="stat-gradient-green" delay={150} />
          <StatCard icon={Users} label="Technician Utilization" value={`${stats?.technicianUtilization ?? 0}%`} gradient="stat-gradient-purple" delay={225} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="animate-card-enter"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5 text-green-600" /></div><div><p className="text-sm text-muted-foreground">Completed</p><p className="text-xl font-bold text-green-600">{formatNum(Number(stats?.installCompleted) ?? 0)}</p></div></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "75ms" }}><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0"><Clock className="h-5 w-5 text-amber-600" /></div><div><p className="text-sm text-muted-foreground">Pending</p><p className="text-xl font-bold text-amber-600">{formatNum(Number(stats?.installPending) ?? 0)}</p></div></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "150ms" }}><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0"><XCircle className="h-5 w-5 text-red-600" /></div><div><p className="text-sm text-muted-foreground">Cancelled</p><p className="text-xl font-bold text-red-600">{formatNum(Number(stats?.installCancelled) ?? 0)}</p></div></CardContent></Card>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="animate-card-enter"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Wrench className="h-4 w-4 text-[#DC2626]" /> Complaints by Type</CardTitle></CardHeader><CardContent><HorizontalBarChart data={(d.complaintsByType as Record<string, string | number>[]) || []} xKey="type" yKey="count" barColor="#DC2626" height={240} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-[#7C3AED]" /> Complaints by Priority</CardTitle></CardHeader><CardContent className="flex justify-center"><DonutChart data={(d.complaintsByPriority as Record<string, string | number>[]) || []} xKey="priority" yKey="count" size={220} centerLabel={formatNum(Number(stats?.totalComplaints) ?? 0)} /></CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "200ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> Technician Leaderboard</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="w-8">#</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Resolved</TableHead><TableHead className="text-right">Avg Time</TableHead><TableHead className="text-right">Rating</TableHead><TableHead className="text-right">SLA %</TableHead></TableRow></TableHeader><TableBody>
              {((d.technicianLeaderboard as { rank: number; name: string; resolved: number; avgTime: string; rating: number; slaCompliance: number }[]) || []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>}
              {((d.technicianLeaderboard as { rank: number; name: string; resolved: number; avgTime: string; rating: number; slaCompliance: number }[]) || []).map((t) => (
                <TableRow key={t.rank} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-semibold text-muted-foreground">#{t.rank}</TableCell><TableCell className="font-medium">{t.name}</TableCell><TableCell className="text-right"><span className="text-green-600 font-medium">{t.resolved}</span></TableCell><TableCell className="text-right text-sm">{t.avgTime}</TableCell><TableCell className="text-right"><StarRating rating={t.rating} /></TableCell><TableCell className="text-right"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.slaCompliance >= 90 ? "bg-green-100 text-green-700" : t.slaCompliance >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{t.slaCompliance}%</span></TableCell></TableRow>
              ))}
            </TableBody></Table></div>
          </CardContent></Card>
          <Card className="animate-card-enter" style={{ animationDelay: "300ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-[#16A34A]" /> Agent Collection Leaderboard</CardTitle></CardHeader><CardContent>
            <div className="max-h-96 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="w-8">#</TableHead><TableHead>Agent</TableHead><TableHead className="text-right">Target</TableHead><TableHead className="text-right">Collected</TableHead><TableHead className="text-right">Achieved</TableHead></TableRow></TableHeader><TableBody>
              {((d.agentCollectionLeaderboard as { rank: number; name: string; target: number; collected: number; achieved: number }[]) || []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>}
              {((d.agentCollectionLeaderboard as { rank: number; name: string; target: number; collected: number; achieved: number }[]) || []).map((a) => (
                <TableRow key={a.rank} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-semibold text-muted-foreground">#{a.rank}</TableCell><TableCell className="font-medium">{a.name}</TableCell><TableCell className="text-right text-muted-foreground">{formatINR(a.target)}</TableCell><TableCell className="text-right font-semibold">{formatINR(a.collected)}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-2"><Progress value={Math.min(a.achieved, 100)} className="w-16 h-2" /><span className={`text-xs font-semibold ${a.achieved >= 100 ? "text-green-600" : "text-amber-600"}`}>{a.achieved}%</span></div></TableCell></TableRow>
              ))}
            </TableBody></Table></div>
          </CardContent></Card>
        </div>
        <Card className="animate-card-enter" style={{ animationDelay: "350ms" }}><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#2563EB]" /> Monthly Operations Summary</CardTitle></CardHeader><CardContent>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">New Connections</TableHead><TableHead className="text-right">Complaints</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader><TableBody>
            {((d.monthlyOperationsSummary as { month: string; connections: number; complaints: number; revenue: number }[]) || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>}
            {((d.monthlyOperationsSummary as { month: string; connections: number; complaints: number; revenue: number }[]) || []).map((row, i) => (
              <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-medium">{row.month}</TableCell><TableCell className="text-right"><span className="text-green-600 font-medium">+{row.connections}</span></TableCell><TableCell className="text-right">{row.complaints}</TableCell><TableCell className="text-right font-semibold">{formatINR(row.revenue)}</TableCell></TableRow>
            ))}
          </TableBody></Table></div>
        </CardContent></Card>
      </div>
    );
  };

  // ─── Custom Report Builder ──────────────────────────
  const renderCustomReport = () => {
    if (loading) return <LoadingSkeleton />;
    return (
      <div className="space-y-6">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-[#7C3AED]" />Custom Report Builder</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><Label className="text-sm font-medium">Data Source</Label><Select value={customSource} onValueChange={(v) => { setCustomSource(v); setCustomColumns([]); setCustomFilters({}); }}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="subscribers">Subscribers</SelectItem><SelectItem value="payments">Payments</SelectItem><SelectItem value="invoices">Invoices</SelectItem><SelectItem value="complaints">Complaints</SelectItem></SelectContent></Select></div>
              <div><Label className="text-sm font-medium">Start Date</Label><Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="mt-1" /></div>
              <div><Label className="text-sm font-medium">End Date</Label><Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="mt-1" /></div>
            </div>
            {customFilterDefs.length > 0 && (
              <div><Label className="text-sm font-medium flex items-center gap-1.5 mb-2"><Filter className="h-3.5 w-3.5" />Filters</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {customFilterDefs.map((f) => (
                    <div key={f.field}><Label className="text-xs text-muted-foreground">{f.label}</Label>
                      {f.type === "select" ? (<Select value={customFilters[f.field] || ""} onValueChange={(v) => setCustomFilters((prev) => ({ ...prev, [f.field]: v }))}><SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All</SelectItem>{f.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>) : (<Input value={customFilters[f.field] || ""} onChange={(e) => setCustomFilters((prev) => ({ ...prev, [f.field]: e.target.value }))} placeholder={`Filter by ${f.label.toLowerCase()}`} className="mt-1 h-8 text-xs" />)}</div>
                  ))}
                  <div className="flex items-end"><Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setCustomFilters({})}>Clear</Button></div>
                </div>
              </div>
            )}
            {customColumnDefs.length > 0 && (
              <div><Label className="text-sm font-medium mb-2">Select Columns ({customColumns.length}/{customColumnDefs.length})</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded-lg p-3">
                  {customColumnDefs.map((col) => (
                    <label key={col.field} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={customColumns.includes(col.field)} onChange={() => toggleCustomColumn(col.field)} className="rounded border-gray-300" /><span className="text-xs">{col.label}</span></label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 pt-2">
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm" onClick={() => { if (customPage !== 1) setCustomPage(1); }} disabled={!customStartDate || !customEndDate || customColumns.length === 0}><BarChart3 className="h-4 w-4 mr-2" />Generate Report</Button>
            </div>
          </CardContent>
        </Card>
        {customLoading ? (<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>) : customData && customData.rows.length > 0 ? (
          <Card className="border shadow-sm"><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base font-semibold">Report Results</CardTitle><Badge variant="outline" className="text-xs">{customData.total} records</Badge></div></CardHeader><CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto"><Table><TableHeader><TableRow>{customData.headers.map((h) => <TableHead key={h} className="text-xs font-medium uppercase whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{customData.rows.map((row, i) => (<TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">{customData.headers.map((h) => <TableCell key={h} className="text-xs whitespace-nowrap">{String(row[h] ?? "")}</TableCell>)}</TableRow>))}</TableBody></Table></div>
            {customData.totalPages > 1 && (<div className="flex items-center justify-between p-3 border-t"><span className="text-xs text-muted-foreground">Page {customData.page} of {customData.totalPages}</span><div className="flex gap-1"><Button variant="outline" size="sm" className="h-7 text-xs" disabled={customPage <= 1} onClick={() => setCustomPage((p) => p - 1)}>Previous</Button><Button variant="outline" size="sm" className="h-7 text-xs" disabled={customPage >= customData.totalPages} onClick={() => setCustomPage((p) => p + 1)}>Next</Button></div></div>)}
          </CardContent></Card>
        ) : customData && customData.rows.length === 0 ? (<EmptyState message="No data found. Try adjusting your filters." />) : null}
      </div>
    );
  };

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Comprehensive business intelligence across all modules</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2" disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={exportCurrentTab} variant="outline" size="sm" className="gap-2">
            <FileDown className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-2">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        {PERIODS.map((p) => (
          <Button key={p.value} size="sm" variant={!isCustom && period === p.value ? "default" : "outline"}
            className={!isCustom && period === p.value ? "bg-[#DC2626] hover:bg-[#B91C1C] text-white" : ""}
            onClick={() => handlePeriodChange(p.value)}>{p.label}</Button>
        ))}
        <Popover open={customDateOpen} onOpenChange={setCustomDateOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant={isCustom ? "default" : "outline"}
              className={isCustom ? "bg-[#DC2626] hover:bg-[#B91C1C] text-white gap-2" : "gap-2"}>
              <CalendarIcon className="h-4 w-4" />
              {isCustom && customStart && customEnd ? `${format(customStart, "dd MMM")} – ${format(customEnd, "dd MMM")}` : "Custom"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-3">
              <p className="text-sm font-medium">Select date range</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground mb-1">Start Date</p><Calendar mode="single" selected={customStart} onSelect={(d) => setCustomStart(d)} initialFocus /></div>
                <div><p className="text-xs text-muted-foreground mb-1">End Date</p><Calendar mode="single" selected={customEnd} onSelect={(d) => setCustomEnd(d)} disabled={(date) => customStart ? date < customStart : false} initialFocus /></div>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" onClick={handleCustomApply} disabled={!customStart || !customEnd} className="bg-[#DC2626] hover:bg-[#B91C1C] text-white">Apply</Button>
                <Button size="sm" variant="outline" onClick={() => setCustomDateOpen(false)}>Cancel</Button>
                {isCustom && <Button size="sm" variant="ghost" onClick={handleClearCustom} className="ml-auto text-muted-foreground"><X className="h-3.5 w-3.5 mr-1" /> Clear</Button>}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setFilterPlanId(""); setFilterAreaId(""); }}>
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9 h-auto">
          <TabsTrigger value="financial" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><DollarSign className="h-3 w-3" /><span className="hidden sm:inline">Financial</span></TabsTrigger>
          <TabsTrigger value="subscriber" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><Users className="h-3 w-3" /><span className="hidden sm:inline">Subscriber</span></TabsTrigger>
          <TabsTrigger value="usage" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><Download className="h-3 w-3" /><span className="hidden sm:inline">Usage</span></TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><TrendingUp className="h-3 w-3" /><span className="hidden sm:inline">Revenue</span></TabsTrigger>
          <TabsTrigger value="network" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><Wifi className="h-3 w-3" /><span className="hidden sm:inline">Network</span></TabsTrigger>
          <TabsTrigger value="network_health" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><Activity className="h-3 w-3" /><span className="hidden sm:inline">Health</span></TabsTrigger>
          <TabsTrigger value="accounting" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><Shield className="h-3 w-3" /><span className="hidden sm:inline">RADIUS</span></TabsTrigger>
          <TabsTrigger value="operations" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><Wrench className="h-3 w-3" /><span className="hidden sm:inline">Ops</span></TabsTrigger>
          <TabsTrigger value="custom" className="gap-1 text-xs data-[state=active]:bg-[#DC2626] data-[state=active]:text-white"><SlidersHorizontal className="h-3 w-3" /><span className="hidden sm:inline">Custom</span></TabsTrigger>
        </TabsList>

        <TabsContent value="financial" className="mt-6">{renderFinancial()}</TabsContent>
        <TabsContent value="subscriber" className="mt-6">{renderSubscriber()}</TabsContent>
        <TabsContent value="usage" className="mt-6">{renderUsage()}</TabsContent>
        <TabsContent value="revenue" className="mt-6">{renderRevenue()}</TabsContent>
        <TabsContent value="network" className="mt-6">{renderNetwork()}</TabsContent>
        <TabsContent value="network_health" className="mt-6">{renderNetworkHealth()}</TabsContent>
        <TabsContent value="accounting" className="mt-6">{renderAccounting()}</TabsContent>
        <TabsContent value="operations" className="mt-6">{renderOperations()}</TabsContent>
        <TabsContent value="custom" className="mt-6">{renderCustomReport()}</TabsContent>
      </Tabs>
    </div>
  );
}
