"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, RefreshCw, AlertTriangle, MapPin, Calendar, ArrowRight, Users } from "lucide-react";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────────────

interface RecentSubscriber {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  connectionType: string;
  createdAt: string;
  area: { id: string; name: string } | null;
  plan: { id: string; name: string; priceMonthly: number } | null;
}

// ─── Status helpers ─────────────────────────────────────────────

function statusConfig(status: string) {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Active",
        dotColor: "#16A34A",
        bgClass: "bg-emerald-100 dark:bg-emerald-950/40",
        textClass: "text-emerald-700 dark:text-emerald-400",
      };
    case "TRIAL":
      return {
        label: "Trial",
        dotColor: "#D97706",
        bgClass: "bg-amber-100 dark:bg-amber-950/40",
        textClass: "text-amber-700 dark:text-amber-400",
      };
    case "PENDING_ACTIVATION":
      return {
        label: "Pending",
        dotColor: "#0D9488",
        bgClass: "bg-teal-100 dark:bg-teal-950/40",
        textClass: "text-teal-700 dark:text-teal-400",
      };
    case "SUSPENDED":
      return {
        label: "Suspended",
        dotColor: "#DC2626",
        bgClass: "bg-red-100 dark:bg-red-950/40",
        textClass: "text-red-700 dark:text-red-400",
      };
    case "DISCONNECTED":
      return {
        label: "Disconnected",
        dotColor: "#78716C",
        bgClass: "bg-gray-100 dark:bg-gray-950/40",
        textClass: "text-gray-600 dark:text-gray-400",
      };
    default:
      return {
        label: status.replace(/_/g, " "),
        dotColor: "#78716C",
        bgClass: "bg-gray-100 dark:bg-gray-950/40",
        textClass: "text-gray-600 dark:text-gray-400",
      };
  }
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3 py-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Subscriber Row ─────────────────────────────────────────────

function SubscriberRow({ subscriber }: { subscriber: RecentSubscriber }) {
  const config = statusConfig(subscriber.status);

  // Hash name for avatar color
  const colors = ["#DC2626", "#0D9488", "#D97706", "#059669", "#F43F5E", "#EA580C"];
  const hash = subscriber.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const avatarColor = colors[hash % colors.length];
  const initials = subscriber.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0 hover:bg-muted/20 -mx-1 px-1 rounded-md transition-colors">
      {/* Avatar */}
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: avatarColor }}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{subscriber.name}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
          {subscriber.plan && (
            <span className="truncate">{subscriber.plan.name}</span>
          )}
          {subscriber.area && (
            <span className="flex items-center gap-0.5 shrink-0">
              <MapPin className="h-2.5 w-2.5" />
              <span className="truncate max-w-[80px]">{subscriber.area.name}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 mt-0.5">
          <Calendar className="h-2.5 w-2.5" />
          <span>{formatShortDate(subscriber.createdAt)}</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{formatRelativeDate(subscriber.createdAt)}</span>
        </div>
      </div>

      {/* Status Badge */}
      <Badge
        variant="outline"
        className={`text-[10px] px-2 py-0 h-5 font-semibold border-0 shrink-0 ${config.bgClass} ${config.textClass}`}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full mr-1"
          style={{ backgroundColor: config.dotColor }}
        />
        {config.label}
      </Badge>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-10 gap-3">
      <div className="p-3 rounded-full bg-muted/50">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground text-center">No subscribers yet.</p>
    </div>
  );
}

// ─── Recent Signups Widget ──────────────────────────────────────

export function RecentSignupsWidget() {
  const [subscribers, setSubscribers] = useState<RecentSubscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { setCurrentPage } = useAppStore();

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);
    setError(null);

    try {
      const res = await fetch(
        "/api/subscribers?page=1&limit=5&sortBy=createdAt&sortOrder=desc",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch recent signups");
      const json = await res.json();
      setSubscribers(json.subscribers || []);
    } catch (err) {
      console.error("Recent signups widget fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const handleRefresh = useCallback(() => fetchData(false), [fetchData]);

  const handleViewAll = useCallback(() => {
    setCurrentPage("Subscribers", "MAIN");
  }, [setCurrentPage]);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
              <UserPlus className="h-3.5 w-3.5" />
            </div>
            Recent Sign-ups
            {!isLoading && subscribers.length > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-medium tabular-nums bg-muted/60"
              >
                Last 5
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleRefresh}
              disabled={isRefetching}
              aria-label="Refresh recent signups"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-950/30 text-red-500 dark:text-red-400">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <p className="text-sm text-muted-foreground text-center">Failed to load recent sign-ups.</p>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleRefresh}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        ) : subscribers.length > 0 ? (
          <div className="space-y-0">
            {subscribers.map((sub) => (
              <SubscriberRow key={sub.id} subscriber={sub} />
            ))}

            {/* ── View All Button ── */}
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 gap-1.5 text-xs border-dashed hover:border-solid hover:border-red-300 hover:text-red-600 transition-all"
                onClick={handleViewAll}
              >
                <span>View All Subscribers</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/60 text-right mt-2">
              Auto-refreshes every 60s
            </p>
          </div>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
}
