"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  AlertTriangle,
  WifiOff,
  X,
  ServerCrash,
  Clock,
  Zap,
  CheckCircle,
} from "lucide-react";
import { useState } from "react";

interface SystemAlert {
  type: "offline_devices" | "overdue_invoices" | "sla_breaches" | "system_ok";
  message: string;
  count: number;
  severity: "critical" | "warning" | "info" | "success";
}

export function SystemAlertBanner() {
  const [dismissed, setDismissed] = useState(false);

  const { data: alerts, isLoading } = useQuery<SystemAlert[]>({
    queryKey: ["system-alerts-banner"],
    queryFn: async () => {
      try {
        const stats = await apiFetch<{
          openComplaints: number;
          criticalCount: number;
          onlineDevices: number;
          totalDevices: number;
          overdueInvoices: number;
          slaBreaches: number;
        }>("/api/dashboard/stats");

        const result: SystemAlert[] = [];

        // Offline devices check
        const offlineDevices = (stats.totalDevices || 0) - (stats.onlineDevices || 0);
        if (offlineDevices > 0) {
          const severity = offlineDevices > stats.totalDevices * 0.3 ? "critical" : "warning";
          result.push({
            type: "offline_devices",
            message: `${offlineDevices} device${offlineDevices > 1 ? "s" : ""} offline`,
            count: offlineDevices,
            severity,
          });
        }

        // SLA breaches
        if ((stats.slaBreaches || 0) > 0) {
          result.push({
            type: "sla_breaches",
            message: `${stats.slaBreaches} SLA breach${stats.slaBreaches > 1 ? "es" : ""}`,
            count: stats.slaBreaches,
            severity: "critical",
          });
        }

        // Overdue invoices
        if ((stats.overdueInvoices || 0) > 0) {
          result.push({
            type: "overdue_invoices",
            message: `${stats.overdueInvoices} overdue invoice${stats.overdueInvoices > 1 ? "s" : ""}`,
            count: stats.overdueInvoices,
            severity: "warning",
          });
        }

        // Critical complaints
        if ((stats.criticalCount || 0) > 0) {
          result.push({
            type: "sla_breaches",
            message: `${stats.criticalCount} critical complaint${stats.criticalCount > 1 ? "s" : ""}`,
            count: stats.criticalCount,
            severity: "critical",
          });
        }

        // All clear
        if (result.length === 0) {
          result.push({
            type: "system_ok",
            message: "All systems operational",
            count: 0,
            severity: "success",
          });
        }

        return result;
      } catch {
        return [{
          type: "system_ok",
          message: "All systems operational",
          count: 0,
          severity: "success",
        }];
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  if (dismissed || isLoading || !alerts || alerts.length === 0) return null;

  // Only show the first critical or warning alert, or the success message
  const primaryAlert = alerts.find((a) => a.severity === "critical")
    || alerts.find((a) => a.severity === "warning")
    || alerts[0];

  if (!primaryAlert || primaryAlert.severity === "success") return null;

  const remainingCount = alerts.filter((a) => a !== primaryAlert).length;

  const getAlertStyles = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50",
          text: "text-red-800 dark:text-red-300",
          icon: <ServerCrash className="h-4 w-4 text-red-600 dark:text-red-400" />,
          badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
        };
      case "warning":
        return {
          bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50",
          text: "text-amber-800 dark:text-amber-300",
          icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
          badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
        };
      default:
        return {
          bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50",
          text: "text-blue-800 dark:text-blue-300",
          icon: <WifiOff className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
          badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
        };
    }
  };

  const styles = getAlertStyles(primaryAlert.severity);

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 animate-slide-down alert-banner-glow ${primaryAlert.severity === "warning" ? "alert-warning" : ""} ${styles.bg}`}>
      <div className="shrink-0">{styles.icon}</div>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-medium ${styles.text}`}>
          {primaryAlert.message}
        </span>
        {remainingCount > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${styles.badge}`}>
            +{remainingCount} more
          </span>
        )}
        {primaryAlert.severity === "critical" && (
          <span className="text-[10px] text-red-500 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Requires attention
          </span>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
