"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  Wifi,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface SubscriberStats {
  active: number;
}

interface DashboardStats {
  mrr: number;
  networkUptime: number;
  openComplaints: number;
}

interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  database: { status: "connected" | "error" };
}

// ─── Compact Stat Skeleton ──────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Skeleton className="h-3.5 w-3.5 rounded-sm shrink-0" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <Skeleton className="h-3 w-10 rounded-sm" />
        <Skeleton className="h-2 w-6 rounded-sm" />
      </div>
    </div>
  );
}

// ─── Stat Item ──────────────────────────────────────────────────

function StatItem({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
  color: "green" | "red" | "amber";
}) {
  const colorMap = {
    green: "text-emerald-400",
    red: "text-red-400",
    amber: "text-amber-400",
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", colorMap[color])} />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="text-[11px] font-semibold text-[#E2E8F0] truncate">
          {value}
        </span>
        <span className="text-[10px] text-[#64748B] truncate">{label}</span>
      </div>
    </div>
  );
}

// ─── Sidebar Stats Bar ──────────────────────────────────────────

export function SidebarStatsBar() {
  const [expanded, setExpanded] = useState(true);

  // Fetch all 3 data sources in parallel
  const { data: subscriberStats, isLoading: loadingSubs } = useQuery<
    SubscriberStats
  >({
    queryKey: ["sidebar-subscriber-stats"],
    queryFn: () => fetch("/api/subscribers/stats").then((r) => r.json()),
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: 1,
  });

  const { data: dashboardStats, isLoading: loadingDash } = useQuery<
    DashboardStats
  >({
    queryKey: ["sidebar-dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: 1,
  });

  const { data: healthStatus, isLoading: loadingHealth } = useQuery<
    HealthStatus
  >({
    queryKey: ["sidebar-health-status"],
    queryFn: () => fetch("/api/system/health").then((r) => r.json()),
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: 1,
  });

  const isLoading = loadingSubs || loadingDash || loadingHealth;

  // Compute stat values
  const activeSubs = subscriberStats?.active;
  const mrr = dashboardStats?.mrr;
  const openComplaints = dashboardStats?.openComplaints;
  const networkUptime = dashboardStats?.networkUptime;

  // Derive uptime indicator
  const uptimeColor =
    networkUptime != null
      ? networkUptime >= 99
        ? "green"
        : networkUptime >= 95
          ? "amber"
          : "red"
      : "green";

  // Derive complaints indicator
  const complaintsColor =
    openComplaints != null ? (openComplaints === 0 ? "green" : "red") : "green";

  const healthColor =
    healthStatus?.status === "healthy"
      ? "green"
      : healthStatus?.status === "degraded"
        ? "amber"
        : "red";

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 w-full px-3 py-1 text-[10px] font-semibold text-[#64748B] hover:text-[#94A3B8] transition-colors uppercase tracking-wider"
      >
        <div
          className={cn(
            "w-1 h-1 rounded-full",
            healthColor === "green"
              ? "bg-emerald-400"
              : healthColor === "amber"
                ? "bg-amber-400"
                : "bg-red-400"
          )}
        />
        <span className="flex-1 text-left">Live Stats</span>
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )}
      </button>

      {/* Collapsible stats grid */}
      {expanded && (
        <div className="px-1 pb-2 pt-0.5">
          <div className="grid grid-cols-2 gap-0.5 bg-white/[0.03] rounded-lg border border-white/[0.05]">
            {isLoading ? (
              <>
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </>
            ) : (
              <>
                <StatItem
                  icon={Users}
                  value={activeSubs != null ? String(activeSubs) : "—"}
                  label="Active"
                  color="green"
                />
                <StatItem
                  icon={TrendingUp}
                  value={mrr != null ? formatINR(mrr) : "—"}
                  label="MRR"
                  color="green"
                />
                <StatItem
                  icon={AlertTriangle}
                  value={
                    openComplaints != null ? String(openComplaints) : "—"
                  }
                  label="Complaints"
                  color={complaintsColor}
                />
                <StatItem
                  icon={Wifi}
                  value={
                    networkUptime != null ? `${networkUptime}%` : "—"
                  }
                  label="Uptime"
                  color={uptimeColor}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
