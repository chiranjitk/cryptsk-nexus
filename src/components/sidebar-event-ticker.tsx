"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, UserPlus, CreditCard, AlertTriangle, Wifi, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  type: string;
  title: string;
  timestamp: string;
}

interface FeedData {
  items: FeedItem[];
}

// ─── Helpers ────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function getEventIcon(type: string) {
  switch (type) {
    case "subscriber_created":
    case "SUBSCRIBER_CREATED":
      return { icon: UserPlus, color: "text-emerald-400", bg: "bg-emerald-500/10" };
    case "payment_received":
    case "PAYMENT_CONFIRM":
      return { icon: CreditCard, color: "text-green-400", bg: "bg-green-500/10" };
    case "complaint_created":
    case "COMPLAINT":
    case "OUTAGE":
      return { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" };
    case "session_start":
    case "SESSION":
      return { icon: Wifi, color: "text-teal-400", bg: "bg-teal-500/10" };
    case "maintenance":
    case "MAINTENANCE":
      return { icon: Wrench, color: "text-orange-400", bg: "bg-orange-500/10" };
    default:
      return { icon: Activity, color: "text-slate-400", bg: "bg-slate-500/10" };
  }
}

// ─── Component ─────────────────────────────────────────────────

export function SidebarEventTicker() {
  const { data, isLoading } = useQuery<FeedData>({
    queryKey: ["sidebar-event-ticker"],
    queryFn: () =>
      fetch("/api/activity-feed?limit=5").then((r) => r.json()),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  const events = data?.items?.slice(0, 4) ?? [];

  return (
    <div className="group-data-[collapsible=icon]:hidden px-1 pb-1">
      {/* Section Label */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Activity className="h-3 w-3 text-red-500 shrink-0" />
        <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">
          Live Feed
        </span>
        <span className="ml-auto">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
        </span>
      </div>

      {/* Event List */}
      <div className="space-y-0.5 px-1">
        {isLoading ? (
          <div className="space-y-1.5 py-1 px-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-5 bg-white/5 dark:bg-white/[0.03] rounded animate-pulse"
                style={{ width: `${75 - i * 15}%` }}
              />
            ))}
          </div>
        ) : events.length > 0 ? (
          events.map((event, idx) => {
            const { icon: Icon, color, bg } = getEventIcon(event.type);
            return (
              <div
                key={event.id}
                className={cn(
                  "flex items-center gap-2 px-1.5 py-1 rounded-md",
                  "hover:bg-white/5 dark:hover:bg-white/[0.03] transition-colors duration-150",
                  "animate-fade-in",
                )}
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className={cn("shrink-0 p-0.5 rounded", bg)}>
                  <Icon className={cn("h-2.5 w-2.5", color)} />
                </div>
                <span className="text-[10px] text-[#94A3B8] truncate flex-1 leading-tight">
                  {event.title}
                </span>
                <span className="text-[9px] text-[#475569] tabular-nums shrink-0">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="px-1.5 py-2">
            <span className="text-[10px] text-[#475569]">
              No recent activity
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
