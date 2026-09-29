"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Wifi,
  WifiOff,
  Server,
  CreditCard,
  Clock,
  ChevronRight,
  RefreshCw,
  Shield,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ─────────────────────────────────────────────────────

interface SystemAlert {
  id: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "WARNING" | "INFO";
  title: string;
  description: string;
  timestamp: string;
  source: "Complaint" | "Payment" | "Device" | "Invoice" | "Subscriber";
}

interface AlertsSummaryResponse {
  summary: {
    criticalAlerts: number;
    highAlerts: number;
    warnings: number;
    info: number;
  };
  alerts: SystemAlert[];
  networkDevices: {
    online: number;
    offline: number;
    warning: number;
    maintenance: number;
  };
  overdueSummary: {
    count: number;
    totalAmount: number;
  };
  timestamp: string;
}

// ─── Severity Config ───────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    dotColor: string;
    pulseColor: string;
    iconBg: string;
    iconColor: string;
  }
> = {
  CRITICAL: {
    bg: "bg-red-100 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-400",
    border: "border-l-red-500",
    dotColor: "bg-red-500",
    pulseColor: "bg-red-400",
    iconBg: "bg-red-100 dark:bg-red-950/40",
    iconColor: "text-red-600 dark:text-red-400",
  },
  HIGH: {
    bg: "bg-orange-100 dark:bg-orange-950/40",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-l-orange-500",
    dotColor: "bg-orange-500",
    pulseColor: "bg-orange-400",
    iconBg: "bg-orange-100 dark:bg-orange-950/40",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
  WARNING: {
    bg: "bg-amber-100 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-l-amber-500",
    dotColor: "bg-amber-500",
    pulseColor: "bg-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-950/40",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  INFO: {
    bg: "bg-teal-100 dark:bg-teal-950/40",
    text: "text-teal-700 dark:text-teal-400",
    border: "border-l-teal-500",
    dotColor: "bg-teal-500",
    pulseColor: "bg-teal-400",
    iconBg: "bg-teal-100 dark:bg-teal-950/40",
    iconColor: "text-teal-600 dark:text-teal-400",
  },
};

// ─── Source Icon Resolver ──────────────────────────────────────

const SOURCE_ICONS: Record<string, React.ElementType> = {
  Complaint: AlertTriangle,
  Payment: CreditCard,
  Device: Server,
  Invoice: Clock,
  Subscriber: Wifi,
};

function getSourceIcon(source: string): React.ElementType {
  return SOURCE_ICONS[source] || Info;
}

// ─── Relative Time ─────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;

    if (diffMs < 60_000) return "just now";
    if (diffMs < 3_600_000) {
      const mins = Math.floor(diffMs / 60_000);
      return `${mins}m ago`;
    }
    if (diffMs < 86_400_000) {
      const hrs = Math.floor(diffMs / 3_600_000);
      return `${hrs}h ago`;
    }
    if (diffMs < 172_800_000) return "Yesterday";
    const days = Math.floor(diffMs / 86_400_000);
    return `${days}d ago`;
  } catch {
    return dateStr;
  }
}

// ─── Pulsing Dot ───────────────────────────────────────────────

function PulsingDot({
  color,
  active,
}: {
  color: string;
  active: boolean;
}) {
  if (!active) return <span className={cn("h-2 w-2 rounded-full", color)} />;

  return (
    <span className="relative flex h-2 w-2">
      <span
        className={cn(
          "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
          color
        )}
      />
      <span className={cn("relative inline-flex rounded-full h-2 w-2", color)} />
    </span>
  );
}

// ─── Severity Icon Resolver ────────────────────────────────────

function SeverityIcon({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.INFO;
  switch (severity) {
    case "CRITICAL":
      return <AlertCircle className={cn("h-4 w-4", config.iconColor, className)} />;
    case "HIGH":
      return <AlertTriangle className={cn("h-4 w-4", config.iconColor, className)} />;
    case "WARNING":
      return <AlertTriangle className={cn("h-4 w-4", config.iconColor, className)} />;
    default:
      return <Info className={cn("h-4 w-4", config.iconColor, className)} />;
  }
}

// ─── Alert Summary Pill ────────────────────────────────────────

function AlertPill({
  severity,
  count,
}: {
  severity: "CRITICAL" | "HIGH" | "WARNING" | "INFO";
  count: number;
}) {
  const config = SEVERITY_CONFIG[severity];
  const labels: Record<string, string> = {
    CRITICAL: "Critical",
    HIGH: "High",
    WARNING: "Warning",
    INFO: "Info",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
        config.bg,
        config.text
      )}
    >
      <PulsingDot color={config.dotColor} active={count > 0} />
      <span>{labels[severity]}</span>
      <span className="font-bold tabular-nums">{count}</span>
    </div>
  );
}

// ─── Network Device Status Indicator ───────────────────────────

function DeviceStatusIndicator({
  label,
  count,
  dotColor,
  isActive,
}: {
  label: string;
  count: number;
  dotColor: string;
  isActive?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full shrink-0",
          dotColor,
          isActive && "ring-2 ring-offset-1 ring-offset-background ring-current"
        )}
        style={isActive ? { color: "currentColor" } : undefined}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums text-foreground">{count}</span>
    </div>
  );
}

// ─── Mini Progress Bar ─────────────────────────────────────────

function MiniProgressBar({
  percentage,
  color,
}: {
  percentage: number;
  color: string;
}) {
  const clampedPercent = Math.min(Math.max(percentage, 0), 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${clampedPercent}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

// ─── Alert Timeline Item ───────────────────────────────────────

function AlertTimelineItem({
  alert,
  index,
}: {
  alert: SystemAlert;
  index: number;
}) {
  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.INFO;
  const sourceIconEl = getSourceIcon(alert.source);

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-3 px-3 rounded-lg border-l-[3px]",
        config.border,
        "bg-card hover:bg-muted/30 transition-all duration-200",
        "hover:shadow-sm hover:-translate-y-0.5",
        "animate-slide-up"
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Severity icon */}
      <div
        className={cn(
          "flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg mt-0.5",
          config.iconBg
        )}
      >
        <SeverityIcon severity={alert.severity} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">
            {alert.title}
          </p>
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {alert.description}
        </p>

        {/* Source tag + timestamp */}
        <div className="flex items-center gap-2 pt-0.5">
          <Badge
            variant="outline"
            className="h-5 text-[10px] font-medium px-1.5 py-0 gap-1 text-muted-foreground border-border/50"
          >
            {React.createElement(sourceIconEl, { className: "h-2.5 w-2.5" })}
            {alert.source}
          </Badge>
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {formatRelativeTime(alert.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      {/* Summary pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      {/* Network device status */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>

      {/* Alert timeline */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-3 px-3">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-32 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle className="h-8 w-8" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">
          All Systems Operational
        </p>
        <p className="text-xs text-muted-foreground">
          No critical alerts at this time. Everything is running smoothly.
        </p>
      </div>
    </div>
  );
}

// ─── Main Widget ───────────────────────────────────────────────

export function SystemAlertsWidget() {
  const { setCurrentPage } = useAppStore();
  const [data, setData] = useState<AlertsSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/system/alerts-summary", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch system alerts");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("System alerts fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 45 seconds
  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 45000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  const totalAlerts = data
    ? data.summary.criticalAlerts +
      data.summary.highAlerts +
      data.summary.warnings +
      data.summary.info
    : 0;

  const totalDevices =
    data
      ? data.networkDevices.online +
        data.networkDevices.offline +
        data.networkDevices.warning +
        data.networkDevices.maintenance
      : 0;

  const onlinePercentage =
    totalDevices > 0
      ? Math.round((data!.networkDevices.online / totalDevices) * 1000) / 10
      : 100;

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200">
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 p-1.5 text-white shadow-sm">
              <Shield className="h-3.5 w-3.5" />
            </div>
            System Alerts
            {totalAlerts > 0 && (
              <Badge
                variant="destructive"
                className="h-5 text-[10px] font-bold px-1.5 gap-1"
              >
                <Zap className="h-2.5 w-2.5" />
                {totalAlerts}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh alerts"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")}
            />
          </Button>
        </div>
      </CardHeader>

      {/* ── Body ── */}
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data ? (
          <div className="space-y-5">
            {/* ── Section 1: Alert Summary Bar ── */}
            <div className="flex items-center gap-2 flex-wrap">
              <AlertPill severity="CRITICAL" count={data.summary.criticalAlerts} />
              <AlertPill severity="HIGH" count={data.summary.highAlerts} />
              <AlertPill severity="WARNING" count={data.summary.warnings} />
              <AlertPill severity="INFO" count={data.summary.info} />
            </div>

            {/* ── Section 2: Network Device Status ── */}
            <div className="space-y-2.5 p-3 rounded-lg bg-muted/30 border border-border/40">
              <div className="flex items-center gap-1.5">
                <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Network Devices
                </span>
                <span className="ml-auto text-[10px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {onlinePercentage}% online
                </span>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <DeviceStatusIndicator
                  label="Online"
                  count={data.networkDevices.online}
                  dotColor="bg-emerald-500"
                  isActive={data.networkDevices.online > 0}
                />
                <DeviceStatusIndicator
                  label="Offline"
                  count={data.networkDevices.offline}
                  dotColor="bg-red-500"
                  isActive={data.networkDevices.offline > 0}
                />
                <DeviceStatusIndicator
                  label="Warning"
                  count={data.networkDevices.warning}
                  dotColor="bg-amber-500"
                />
                <DeviceStatusIndicator
                  label="Maintenance"
                  count={data.networkDevices.maintenance}
                  dotColor="bg-gray-400"
                />
              </div>

              <MiniProgressBar
                percentage={onlinePercentage}
                color={onlinePercentage >= 90 ? "#16A34A" : onlinePercentage >= 70 ? "#D97706" : "#DC2626"}
              />
            </div>

            {/* ── Section 3: Alert Timeline ── */}
            {data.alerts.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Recent Alerts
                  </span>
                  {data.overdueSummary.count > 0 && (
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatINR(data.overdueSummary.totalAmount)} overdue
                    </span>
                  )}
                </div>

                <div
                  className={cn(
                    "max-h-64 overflow-y-auto pr-1 space-y-2",
                    "scrollbar-thin scrollbar-thumb-rounded-full",
                    "scrollbar-thumb-border/40 scrollbar-track-transparent",
                    "hover:scrollbar-thumb-border/60"
                  )}
                >
                  {data.alerts.map((alert, index) => (
                    <AlertTimelineItem
                      key={alert.id}
                      alert={alert}
                      index={index}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState />
            )}

            {/* ── Section 4: Quick Actions ── */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Quick Actions
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                  onClick={() => setCurrentPage("Complaints", "OPERATIONS")}
                >
                  <AlertTriangle className="h-3 w-3" />
                  View Complaints
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                  onClick={() => setCurrentPage("Invoices", "FINANCE")}
                >
                  <CreditCard className="h-3 w-3" />
                  Overdue Invoices
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                  onClick={() => setCurrentPage("Devices", "NETWORK")}
                >
                  <WifiOff className="h-3 w-3" />
                  Device Health
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                </Button>
              </div>
            </div>

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/50 text-right">
              Auto-refreshes every 45s
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default SystemAlertsWidget;
