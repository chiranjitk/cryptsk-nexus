"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import {
  Activity,
  Clock,
  Database,
  Globe,
  Monitor,
  Radio,
  Server,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

// ─── Stable no-op subscribe for useSyncExternalStore ─────────
const emptySubscribe = () => () => {};

// ─── Time Hook ───────────────────────────────────────────────

function useCurrentTime(): string {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [time, setTime] = useState<string>("--:--:-- --");

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        })
      );
    };
    update();
    const interval = setInterval(update, 1_000);
    return () => clearInterval(interval);
  }, []);

  return mounted ? time : "--:--:-- --";
}

function useCurrentDate(): string {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    const update = () => {
      setDate(
        new Date().toLocaleDateString("en-IN", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        })
      );
    };
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

  return mounted ? date : "";
}

// ─── Uptime Hook ─────────────────────────────────────────────

function useServerUptime(): string {
  const startTimeRef = useRef(Date.now());
  const [uptime, setUptime] = useState<string>("0m");

  useEffect(() => {
    const format = () => {
      const diff = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };
    const interval = setInterval(() => setUptime(format()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return uptime;
}

// ─── System Stats from API ───────────────────────────────────

function useSystemStats() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: mounted,
  });

  return data;
}

// ─── Status Indicator ────────────────────────────────────────

function StatusDot({ status }: { status: "online" | "degraded" | "offline" }) {
  const colors = {
    online: "bg-emerald-500",
    degraded: "bg-amber-500",
    offline: "bg-red-500",
  };
  const glowColors = {
    online: "ring-emerald-500/30",
    degraded: "ring-amber-500/30",
    offline: "ring-red-500/30",
  };
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span
        className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-40", colors[status])}
      />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full ring-2", colors[status], glowColors[status])} />
    </span>
  );
}

// ─── App Footer Component ─────────────────────────────────────

export function AppFooter() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const currentTime = useCurrentTime();
  const currentDate = useCurrentDate();
  const uptime = useServerUptime();
  const stats = useSystemStats();

  // ── Online Subscriber Count ──
  const { data: onlineData } = useQuery({
    queryKey: ["footer-online-count"],
    queryFn: () => fetch("/api/subscribers/online-count").then((r) => r.json()),
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: mounted,
  });

  // ── RADIUS Sync Status ──
  const { data: radiusData } = useQuery({
    queryKey: ["footer-radius-status"],
    queryFn: () => fetch("/api/freeradius/sync-status").then((r) => r.json()),
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: mounted,
  });

  const radiusStatus = radiusData?.status === "synced" ? "online" : radiusData?.status === "minor_drift" ? "degraded" : "offline";

  const networkUptime = stats?.networkUptime ?? 99.9;
  const activeSubs = stats?.activeSubscribers ?? stats?.activeConnections ?? "—";
  const totalSubs = stats?.totalSubscribers ?? "—";
  const networkStatus: "online" | "degraded" | "offline" =
    networkUptime >= 99 ? "online" : networkUptime >= 95 ? "degraded" : "offline";

  return (
    <footer className="mt-auto w-full shrink-0">
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2 lg:px-6",
          "border-t border-border/50",
          "bg-background/60 backdrop-blur-sm"
        )}
      >
        {/* ── Left: System Info ── */}
        <div className="flex min-w-0 shrink items-center gap-4 text-xs text-muted-foreground/80">
          {/* Network Status */}
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all duration-200",
            networkStatus === "online" && "badge-success",
            networkStatus === "degraded" && "badge-warning",
            networkStatus === "offline" && "badge-danger"
          )}>
            <StatusDot status={networkStatus} />
            <span className={cn(
              "font-medium",
              (networkStatus === "online" || networkStatus === "degraded" || networkStatus === "offline") && "text-white"
            )}>
              {networkUptime >= 99 ? "Operational" : networkUptime >= 95 ? "Degraded" : "Down"}
            </span>
          </div>

          <span className="hidden sm:inline text-border/50">|</span>

          {/* Uptime */}
          <div className="hidden sm:flex items-center gap-1.5">
            <Server className="h-3 w-3 shrink-0 text-emerald-500" />
            <span>
              Uptime:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400 stat-value">{uptime}</span>
            </span>
          </div>

          <span className="hidden md:inline text-border/50">|</span>

          {/* Network Uptime */}
          <div className="hidden md:flex items-center gap-1.5">
            <Activity className="h-3 w-3 shrink-0" />
            <span>
              Network:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400 stat-value">
                {networkUptime}%
              </span>
            </span>
          </div>

          <span className="hidden 2xl:inline text-border/50">|</span>

          {/* Online Subscribers */}
          <div className="hidden 2xl:flex items-center gap-1.5">
            <Wifi className="h-3 w-3 shrink-0 text-emerald-500" />
            <span>
              Online:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums stat-value">
                {onlineData?.onlineCount ?? "—"}
              </span>
            </span>
          </div>

          <span className="hidden xl:inline text-border/50">|</span>

          {/* RADIUS Status */}
          <div className="hidden xl:flex items-center gap-1.5">
            <Radio className="h-3 w-3 shrink-0" />
            <StatusDot status={radiusStatus} />
            <span>
              RADIUS:{" "}
              <span className={cn(
                "font-medium inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                radiusData?.status === "synced" && "badge-success",
                radiusData?.status === "minor_drift" && "badge-warning",
                (!radiusData?.status || radiusData?.status === "drifted") && "badge-danger"
              )}>
                {radiusData?.status === "synced" ? "Synced" : radiusData?.status === "minor_drift" ? "Drift" : radiusData?.status === "drifted" ? "Error" : "…"}
              </span>
            </span>
          </div>
        </div>

        {/* ── Center: Subscriber Info ── */}
        <div className="hidden 2xl:flex items-center gap-4 text-xs text-muted-foreground/80">
          <div className="flex items-center gap-1.5">
            <Globe className="h-3 w-3 shrink-0" />
            <span>
              Total:{" "}
              <span className="font-medium text-foreground/80 dark:text-foreground/70">
                {typeof totalSubs === "number" ? totalSubs.toLocaleString("en-IN") : totalSubs}
              </span>
            </span>
          </div>
        </div>

        {/* ── Right: Date, Time, Environment ── */}
        <div className="flex min-w-0 shrink items-center gap-4 text-xs text-muted-foreground/80">
          <div className="hidden sm:flex items-center gap-1.5">
            <Database className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground/70 dark:text-foreground/60">PostgreSQL</span>
          </div>

          <span className="hidden sm:inline text-border/50">|</span>

          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="tabular-nums font-medium text-foreground/70 dark:text-foreground/60 whitespace-nowrap" suppressHydrationWarning>
              {currentTime}
            </span>
          </div>

          <span className="hidden md:inline text-border/50">|</span>

          <div className="hidden md:flex items-center gap-1.5">
            <Monitor className="h-3 w-3 shrink-0" />
            <span className="whitespace-nowrap text-foreground/70 dark:text-foreground/60" suppressHydrationWarning>{currentDate}</span>
          </div>

          <span className="hidden 2xl:inline text-border/50">|</span>

          <div className="hidden 2xl:flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 shrink-0" />
            <span className="font-medium text-emerald-600 dark:text-emerald-400">Secure</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
