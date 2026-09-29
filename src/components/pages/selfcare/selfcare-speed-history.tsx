"use client";

import React, { useEffect, useState } from "react";
import { useSubscriberAuthStore } from "@/store/subscriber-auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Zap,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import type { NavPage } from "./selfcare-layout";

// ─── Types ──────────────────────────────────────────────────

interface SpeedHistoryProps {
  onNavigate?: (page: NavPage) => void;
}

interface DailySpeed {
  date: string;
  downloadMbps: number;
  uploadMbps: number;
}

interface SpeedData {
  daily: DailySpeed[];
  averages: { download: number; upload: number };
  peak: { download: number; upload: number; date: string | null };
  planSpeedDown: number;
  planSpeedUp: number;
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ─── Speed History Page ──────────────────────────────────────

export default function SelfcareSpeedHistory({ onNavigate }: SpeedHistoryProps) {
  const { subscriber } = useSubscriberAuthStore();
  const [data, setData] = useState<SpeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/selfcare/speed-history");
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load speed history");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangleIcon className="w-7 h-7 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchData} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.daily.length === 0) {
    return (
      <div className="text-center py-16">
        <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-muted-foreground">No speed history data available.</p>
        <p className="text-xs text-muted-foreground mt-1">Speed data will appear as you use the internet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Speed History</h2>
          <p className="text-sm text-muted-foreground">
            Daily average download &amp; upload speeds — last 30 days
            {subscriber?.plan?.name && (
              <span> · Plan: <span className="font-medium text-red-600">{subscriber.plan.name}</span></span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={fetchData}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                <ArrowDownToLine className="w-4 h-4 text-white" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Download</p>
            </div>
            <p className="text-xl font-bold text-foreground">{data.averages.download.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">Mbps</span></p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center">
                <ArrowUpFromLine className="w-4 h-4 text-white" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Upload</p>
            </div>
            <p className="text-xl font-bold text-foreground">{data.averages.upload.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">Mbps</span></p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Peak Download</p>
            </div>
            <p className="text-xl font-bold text-foreground">{data.peak.download.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">Mbps</span></p>
            {data.peak.date && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(data.peak.date)}</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Peak Upload</p>
            </div>
            <p className="text-xl font-bold text-foreground">{data.peak.upload.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">Mbps</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Line Chart */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Daily Speed Trend</CardTitle>
              <CardDescription className="text-xs">Average download &amp; upload speeds over last 30 days</CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-red-500 rounded" />
                <span className="text-muted-foreground">Download</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-teal-500 rounded" />
                <span className="text-muted-foreground">Upload</span>
              </span>
              {data.planSpeedDown > 0 && (
                <Badge className="text-[10px] bg-muted text-muted-foreground border-0">
                  Plan: {data.planSpeedDown}/{data.planSpeedUp} Mbps
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full h-64 relative">
            <svg viewBox="0 0 800 200" className="w-full h-full" preserveAspectRatio="none">
              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1="0" y1={i * 50}
                  x2="800" y2={i * 50}
                  stroke="currentColor"
                  className="text-muted/20"
                  strokeWidth="0.5"
                />
              ))}

              {/* Download area + line */}
              {data.daily.length > 1 && (() => {
                const maxSpeed = Math.max(
                  ...data.daily.map((d) => d.downloadMbps),
                  ...data.daily.map((d) => d.uploadMbps),
                  0.1
                );
                const downloadPoints = data.daily.map((d, i) => {
                  const x = (i / (data.daily.length - 1)) * 800;
                  const y = 190 - (d.downloadMbps / maxSpeed) * 180;
                  return `${x},${y}`;
                }).join(" ");
                const downloadArea = `0,190 ${downloadPoints} 800,190`;

                const uploadPoints = data.daily.map((d, i) => {
                  const x = (i / (data.daily.length - 1)) * 800;
                  const y = 190 - (d.uploadMbps / maxSpeed) * 180;
                  return `${x},${y}`;
                }).join(" ");
                const uploadArea = `0,190 ${uploadPoints} 800,190`;

                return (
                  <>
                    {/* Download area */}
                    <polygon points={downloadArea} fill="#DC2626" opacity="0.08" />
                    <polyline points={downloadPoints} fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Upload area */}
                    <polygon points={uploadArea} fill="#0D9488" opacity="0.06" />
                    <polyline points={uploadPoints} fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                );
              })()}

              {/* X axis labels (every 5th day) */}
              {data.daily.filter((_, i) => i % 5 === 0 || i === data.daily.length - 1).map((d, i) => {
                const idx = data.daily.indexOf(d);
                const x = (idx / Math.max(data.daily.length - 1, 1)) * 800;
                return (
                  <text key={d.date} x={x} y="200" className="fill-muted-foreground" fontSize="9" textAnchor="middle" dominantBaseline="hanging">
                    {new Date(d.date + "T00:00:00").getDate()}
                  </text>
                );
              })}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Daily Breakdown Table */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            Daily Breakdown
          </CardTitle>
          <CardDescription className="text-xs">Detailed speed data for each day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full min-w-[400px]">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b border-border/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Date</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Download (Mbps)</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Upload (Mbps)</th>
                  <th className="text-center text-xs font-medium text-muted-foreground p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...data.daily].reverse().map((day, idx) => {
                  const planRatio = data.planSpeedDown > 0 ? day.downloadMbps / data.planSpeedDown : 0;
                  const statusColor = planRatio >= 0.7 ? "text-emerald-600" : planRatio >= 0.3 ? "text-amber-600" : "text-red-600";
                  const statusLabel = planRatio >= 0.7 ? "Good" : planRatio >= 0.3 ? "Fair" : "Low";
                  return (
                    <tr key={day.date} className={idx % 2 === 0 ? "bg-muted/20" : ""}>
                      <td className="text-sm p-3 font-medium text-foreground">{formatDate(day.date)}</td>
                      <td className="text-sm p-3 text-right font-mono tabular-nums">
                        <span className="flex items-center justify-end gap-1">
                          <ArrowDownToLine className="w-3 h-3 text-red-500" />
                          {day.downloadMbps.toFixed(2)}
                        </span>
                      </td>
                      <td className="text-sm p-3 text-right font-mono tabular-nums">
                        <span className="flex items-center justify-end gap-1">
                          <ArrowUpFromLine className="w-3 h-3 text-teal-500" />
                          {day.uploadMbps.toFixed(2)}
                        </span>
                      </td>
                      <td className="text-sm p-3 text-center">
                        <Badge
                          className={`text-[10px] border-0 ${
                            planRatio >= 0.7
                              ? "bg-emerald-100 text-emerald-700"
                              : planRatio >= 0.3
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {statusLabel}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Inline icon for error state
function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
