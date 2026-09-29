"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { AlertTriangle, FileText, Wifi, ShieldAlert, ChevronRight, Bell } from "lucide-react";
import { toast } from "sonner";

interface NotificationSummaryData {
  openComplaints: number;
  criticalAlerts: number;
  overdueInvoices: number;
  offlineDevices: number;
}

export function NotificationSummaryWidget() {
  const { setCurrentPage } = useAppStore();

  const { data, isLoading } = useQuery<NotificationSummaryData>({
    queryKey: ["notification-summary"],
    queryFn: async () => {
      const res = await apiFetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      return {
        openComplaints: json.openComplaints || 0,
        criticalAlerts: json.criticalCount || 0,
        overdueInvoices: json.overdueCount || 0,
        offlineDevices: json.offlineCount || 0,
      };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const items = [
    { icon: AlertTriangle, label: "Open Complaints", count: data?.openComplaints ?? 0, color: "border-amber-400 bg-amber-50 dark:bg-amber-950/30", iconColor: "text-amber-500", page: "Complaints", section: "OPERATIONS" },
    { icon: ShieldAlert, label: "Critical Alerts", count: data?.criticalAlerts ?? 0, color: "border-red-400 bg-red-50 dark:bg-red-950/30", iconColor: "text-red-500", page: "Network Alerts", section: "NETWORK" },
    { icon: FileText, label: "Overdue Invoices", count: data?.overdueInvoices ?? 0, color: "border-orange-400 bg-orange-50 dark:bg-orange-950/30", iconColor: "text-orange-500", page: "Invoices", section: "FINANCE" },
    { icon: Wifi, label: "Offline Devices", count: data?.offlineDevices ?? 0, color: "border-slate-400 bg-slate-50 dark:bg-slate-950/30", iconColor: "text-slate-500", page: "Devices", section: "NETWORK" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-card-enter">
      {items.map((item) => {
        const Icon = item.icon;
        const isUrgent = item.count > 0;
        return (
          <button
            key={item.label}
            onClick={() => { setCurrentPage(item.page, item.section); toast.info(`Navigating to ${item.page}`); }}
            className={`flex items-center gap-3 p-3 rounded-xl border-l-4 ${item.color}
              ${isUrgent ? 'ring-1 ring-inset ring-current/10' : 'opacity-70'}
              hover:opacity-100 hover:shadow-md transition-all duration-200 btn-press text-left group`}
          >
            <div className={`flex-shrink-0 p-2 rounded-lg bg-white/60 dark:bg-white/10 ${item.iconColor}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-lg font-bold tabular-nums ${isUrgent ? item.iconColor : 'text-muted-foreground'}`}>
                {isLoading ? (
                  <span className="inline-block w-6 h-5 bg-muted animate-pulse rounded" />
                ) : item.count}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{item.label}</p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
