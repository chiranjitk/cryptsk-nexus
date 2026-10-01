"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Server,
  Database,
  Clock,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

interface HealthData {
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

function StatusBadge({ status }: { status: string }) {
  if (status === "healthy" || status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
        <CheckCircle2 className="h-3 w-3" />
        {status === "healthy" ? "Healthy" : "Connected"}
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
        <AlertTriangle className="h-3 w-3" />
        Degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/50">
      <XCircle className="h-3 w-3" />
      {status === "error" ? "Error" : "Critical"}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value, sublabel }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors duration-150">
      <div className="p-2 rounded-lg bg-background border border-border/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5 truncate">{value}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}

export function SystemOverviewWidget() {
  const { data: health, isLoading } = useQuery<HealthData>({
    queryKey: ["system-overview-health"],
    queryFn: () => apiFetch<HealthData>("/api/system/health"),
    refetchInterval: 30000,
  });

  const nodeVersion = typeof process !== "undefined" ? process.version?.replace("v", "") : "—";

  // Active sessions from system monitor
  const { data: sysMonitor } = useQuery({
    queryKey: ["system-overview-monitor"],
    queryFn: () => apiFetch<{ pppoe?: { activeSessions: number } }>("/api/system-monitor"),
    refetchInterval: 15000,
  });

  const activeSessions = (sysMonitor as any)?.pppoe?.activeSessions ?? "—";

  if (isLoading) {
    return (
      <Card className="border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Server className="h-4 w-4 text-red-500" />
            System Overview
          </CardTitle>
          {health && <StatusBadge status={health.status} />}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-2">
          <InfoRow
            icon={Server}
            label="Server Status"
            value={health?.status === "healthy" ? "Operational" : health?.status === "degraded" ? "Degraded" : "Critical"}
            sublabel={health?.server}
          />
          <InfoRow
            icon={Database}
            label="Database Size"
            value={health?.database?.size ?? "—"}
            sublabel={`PostgreSQL · ${health?.database?.status === "connected" ? "Connected" : "Disconnected"}`}
          />
          <InfoRow
            icon={Cpu}
            label="Active Sessions"
            value={typeof activeSessions === "number" ? activeSessions.toLocaleString("en-IN") : String(activeSessions)}
            sublabel="PPPoE / RADIUS"
          />
          <InfoRow
            icon={Clock}
            label="Server Uptime"
            value={health?.uptimeHuman ?? "—"}
            sublabel={`Memory: ${health?.memory?.used ?? "—"} / ${health?.memory?.total ?? "—"}`}
          />
          <InfoRow
            icon={Server}
            label="Node.js Version"
            value={nodeVersion}
            sublabel={health?.version ? `Platform v${health.version}` : ""}
          />
        </div>
      </CardContent>
    </Card>
  );
}
