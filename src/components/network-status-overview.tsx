"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Wifi, WifiOff, AlertTriangle, HelpCircle, Server, Globe, Activity } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";

interface NetworkStatusData {
  onlineDevices: number;
  totalDevices: number;
  offlineCount: number;
  warningDevices: number;
  networkUptime: number;
  onlineDevices_list?: { id: string; name: string; type: string; cpuUsage: number | null; memoryUsage: number | null }[];
}

export function NetworkStatusOverview() {
  const { setCurrentPage } = useAppStore();

  const { data, isLoading } = useQuery<NetworkStatusData>({
    queryKey: ["network-status-overview"],
    queryFn: () => apiFetch<NetworkStatusData>("/api/dashboard"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const uptimeColor = (data?.networkUptime ?? 99.9) >= 99.5 ? "text-emerald-500" : (data?.networkUptime ?? 99.9) >= 99 ? "text-amber-500" : "text-red-500";
  const uptimeBg = (data?.networkUptime ?? 99.9) >= 99.5 ? "bg-emerald-500" : (data?.networkUptime ?? 99.9) >= 99 ? "bg-amber-500" : "bg-red-500";

  const statusItems = [
    { icon: Wifi, label: "Online", count: data?.onlineDevices ?? 0, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800" },
    { icon: WifiOff, label: "Offline", count: data?.offlineCount ?? 0, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" },
    { icon: AlertTriangle, label: "Warning", count: data?.warningDevices ?? 0, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 animate-card-enter glass-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30">
            <Globe className="h-4 w-4 text-blue-500" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Network Status</h3>
        </div>
        <button
          onClick={() => { setCurrentPage("Devices", "NETWORK"); toast.info("Navigating to Devices"); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          View All
        </button>
      </div>

      {/* Uptime bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Network Uptime</span>
          <span className={`text-sm font-bold tabular-nums ${uptimeColor}`}>
            {isLoading ? <span className="inline-block w-10 h-4 bg-muted animate-pulse rounded" /> : `${data?.networkUptime ?? 99.9}%`}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${uptimeBg} transition-all duration-1000 ease-out`}
            style={{ width: `${Math.min(data?.networkUptime ?? 99.9, 100)}%` }}
          />
        </div>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-3 gap-2">
        {statusItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border ${item.border} ${item.bg} transition-all duration-200`}
            >
              <Icon className={`h-4 w-4 ${item.color}`} />
              <span className={`text-lg font-bold tabular-nums ${item.color}`}>
                {isLoading ? <span className="inline-block w-6 h-5 bg-muted animate-pulse rounded" /> : item.count}
              </span>
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* Total devices */}
      <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Total Devices Monitored</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {isLoading ? <span className="inline-block w-8 h-4 bg-muted animate-pulse rounded" /> : (data?.totalDevices ?? 0)}
        </span>
      </div>
    </div>
  );
}
