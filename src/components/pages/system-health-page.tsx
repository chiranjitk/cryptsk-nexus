"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, Database, HardDrive, Cpu, MemoryStick, Clock,
  CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, Server,
  Heart, Zap, TrendingUp, type LucideIcon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
interface HealthResponse {
  status: "healthy" | "degraded" | "critical";
  uptime: number;
  uptimeHuman: string;
  memory: {
    used: string;
    total: string;
    percentage: number;
    rss: number;
  };
  database: {
    status: "connected" | "error";
    size: string;
  };
  version: string;
  timestamp: string;
  server: string;
}

interface MetricsResponse {
  metrics: string; // Prometheus text format
}

// ─── Helper ───────────────────────────────────────────────────
const statusConfig: Record<string, { color: string; icon: LucideIcon; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  healthy: { color: "text-emerald-600", icon: CheckCircle2, variant: "default" },
  degraded: { color: "text-amber-500", icon: AlertTriangle, variant: "outline" },
  critical: { color: "text-red-600", icon: AlertCircle, variant: "destructive" },
  connected: { color: "text-emerald-600", icon: Database, variant: "default" },
  error: { color: "text-red-600", icon: AlertCircle, variant: "destructive" },
};

// ─── Component ────────────────────────────────────────────────
export default function SystemHealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const healthQuery = useQuery<HealthResponse>({
    queryKey: ["system-health"],
    queryFn: () => apiFetch<HealthResponse>("/api/system/health"),
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const metricsQuery = useQuery<string>({
    queryKey: ["system-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics");
      return res.text();
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const parsedMetrics = parsePrometheusMetrics(metricsQuery.data || "");

  const health = healthQuery.data;
  const status = health?.status || "healthy";
  const statusInfo = statusConfig[status];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6 text-red-600" />
            System Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time platform health, performance metrics, and database status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              healthQuery.refetch();
              metricsQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Overall Status Card ────────────────────────────── */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {statusInfo && <statusInfo.icon className={`h-5 w-5 ${statusInfo.color}`} />}
              Overall Status
            </CardTitle>
            <Badge variant={statusInfo.variant} className="text-sm capitalize">
              {status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {healthQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : health ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Server</div>
                <div className="text-sm font-medium mt-1 truncate" title={health.server}>
                  {health.server}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Version</div>
                <div className="text-sm font-medium mt-1">v{health.version}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Uptime</div>
                <div className="text-sm font-medium mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {health.uptimeHuman}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last checked</div>
                <div className="text-sm font-medium mt-1">
                  {new Date(health.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Failed to load health data</div>
          )}
        </CardContent>
      </Card>

      {/* ─── Resource Cards ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Memory */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MemoryStick className="h-4 w-4 text-blue-500" />
              Memory
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Used</span>
                  <span className="font-medium">{health.memory.used}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium">{health.memory.total}</span>
                </div>
                <Progress value={health.memory.percentage} className="h-2" />
                <div className="text-xs text-muted-foreground">
                  {health.memory.percentage.toFixed(1)}% used
                </div>
              </div>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-500" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Badge variant={health.database.status === "connected" ? "default" : "destructive"} className="text-xs">
                    {health.database.status}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Size</span>
                  <span className="font-medium">{health.database.size}</span>
                </div>
              </div>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </CardContent>
        </Card>

        {/* RSS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-purple-500" />
              RSS Memory
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health ? (
              <div className="space-y-2">
                <div className="text-2xl font-bold">
                  {(health.memory.rss / 1024 / 1024).toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">MB</span>
                </div>
                <div className="text-xs text-muted-foreground">Resident set size</div>
              </div>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </CardContent>
        </Card>

        {/* Process */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-orange-500" />
              Process
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-medium">{(health.uptime / 60).toFixed(1)}m</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="default" className="text-xs">running</Badge>
                </div>
              </div>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Prometheus Metrics ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-500" />
            Prometheus Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {parsedMetrics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {parsedMetrics.slice(0, 12).map((metric, idx) => (
                <div key={idx} className="border rounded p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground truncate" title={metric.help || metric.name}>
                    {metric.name}
                  </div>
                  <div className="text-lg font-bold mt-1">
                    {formatMetricValue(metric.value)} <span className="text-xs font-normal text-muted-foreground">{metric.unit}</span>
                  </div>
                  {metric.help && (
                    <div className="text-[10px] text-muted-foreground mt-1 truncate" title={metric.help}>
                      {metric.help}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
          <details className="mt-4">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              View raw Prometheus text
            </summary>
            <pre className="mt-2 text-xs bg-muted/50 p-3 rounded overflow-auto max-h-96 cryptsk-scrollbar">
              {metricsQuery.data || "Loading..."}
            </pre>
          </details>
        </CardContent>
      </Card>

      {/* ─── Recent Activity (placeholder for alerts) ───────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            System Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-8">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            No active alerts. System running smoothly.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

interface ParsedMetric {
  name: string;
  value: number;
  unit: string;
  help?: string;
  type?: string;
}

function parsePrometheusMetrics(text: string): ParsedMetric[] {
  const metrics: ParsedMetric[] = [];
  const lines = text.split("\n");
  let currentHelp: Record<string, string> = {};
  let currentType: Record<string, string> = {};

  // First pass: collect HELP + TYPE
  for (const line of lines) {
    const helpMatch = line.match(/^# HELP (\S+) (.+)$/);
    if (helpMatch) {
      currentHelp[helpMatch[1]] = helpMatch[2];
      continue;
    }
    const typeMatch = line.match(/^# TYPE (\S+) (\w+)$/);
    if (typeMatch) {
      currentType[typeMatch[1]] = typeMatch[2];
      continue;
    }
  }

  // Second pass: collect values
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(\d+(?:\.\d+)?)$/);
    if (match) {
      const name = match[1];
      const value = parseFloat(match[3]);
      if (seen.has(name)) continue;
      seen.add(name);
      metrics.push({
        name,
        value,
        unit: name.includes("seconds") ? "s" : name.includes("bytes") ? "B" : "",
        help: currentHelp[name],
        type: currentType[name],
      });
    }
  }

  return metrics;
}

function formatMetricValue(value: number): string {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + "B";
  if (value >= 1e6) return (value / 1e6).toFixed(2) + "M";
  if (value >= 1e3) return (value / 1e3).toFixed(2) + "K";
  return value.toFixed(2);
}
