"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ──────────────────────────────────────────────────────

interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  database: { status: "connected" | "error" };
}

type ConnectionState = "connected" | "reconnecting" | "offline";

// ─── Pulse Dot ──────────────────────────────────────────────────

function PulseDot({ state }: { state: ConnectionState }) {
  const colorClasses = {
    connected: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
    reconnecting: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
    offline: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
  };

  const pulseClass = state === "connected" ? "animate-pulse" : "";

  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0 transition-colors duration-300",
        colorClasses[state],
        pulseClass
      )}
    />
  );
}

// ─── Online Status Indicator ────────────────────────────────────

export function OnlineStatusIndicator() {
  const { data, isLoading } = useQuery<HealthStatus>({
    queryKey: ["sidebar-connection-status"],
    queryFn: () => fetch("/api/system/health").then((r) => r.json()),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
    refetchIntervalInBackground: true,
  });

  // Map health status to connection state
  let state: ConnectionState = "offline";
  let label = "Offline";
  if (data?.status === "healthy") {
    state = "connected";
    label = "Connected";
  } else if (data?.status === "degraded") {
    state = "reconnecting";
    label = "Reconnecting...";
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-2.5 w-16 rounded-sm" />
      </div>
    );
  }

  const textColor = {
    connected: "text-emerald-400",
    reconnecting: "text-amber-400",
    offline: "text-red-400",
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
      <PulseDot state={state} />
      <span
        className={cn(
          "text-[10px] font-medium tracking-wide uppercase transition-colors duration-300",
          textColor[state]
        )}
      >
        {label}
      </span>
    </div>
  );
}
