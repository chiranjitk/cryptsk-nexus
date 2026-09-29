"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  UserPlus,
  CreditCard,
  MessageSquare,
  CheckCircle,
  FileText,
  ArrowRightLeft,
  AlertTriangle,
  Wrench,
  Activity,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  actorName?: string;
  metadata?: Record<string, string>;
}

interface ActivityFeedProps {
  maxItems?: number;
  showHeader?: boolean;
  compact?: boolean;
  className?: string;
}

// ─── Activity Type Config ──────────────────────────────────────

const ACTIVITY_CONFIG: Record<
  string,
  {
    icon: typeof Activity;
    color: string; // Tailwind text color
    bg: string; // Tailwind bg color
    border: string; // Tailwind border-left color
    darkBg: string;
    darkColor: string;
  }
> = {
  subscriber_created: {
    icon: UserPlus,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-l-green-500",
    darkBg: "dark:bg-green-950/40",
    darkColor: "dark:text-green-400",
  },
  payment_collected: {
    icon: CreditCard,
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-l-teal-500",
    darkBg: "dark:bg-teal-950/40",
    darkColor: "dark:text-teal-400",
  },
  complaint_raised: {
    icon: MessageSquare,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-l-amber-500",
    darkBg: "dark:bg-amber-950/40",
    darkColor: "dark:text-amber-400",
  },
  complaint_resolved: {
    icon: CheckCircle,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-l-green-500",
    darkBg: "dark:bg-green-950/40",
    darkColor: "dark:text-green-400",
  },
  invoice_generated: {
    icon: FileText,
    color: "text-sky-600",
    bg: "bg-sky-50",
    border: "border-l-sky-500",
    darkBg: "dark:bg-sky-950/40",
    darkColor: "dark:text-sky-400",
  },
  plan_changed: {
    icon: ArrowRightLeft,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-l-purple-500",
    darkBg: "dark:bg-purple-950/40",
    darkColor: "dark:text-purple-400",
  },
  device_alert: {
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-l-red-500",
    darkBg: "dark:bg-red-950/40",
    darkColor: "dark:text-red-400",
  },
  installation_completed: {
    icon: Wrench,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-l-emerald-500",
    darkBg: "dark:bg-emerald-950/40",
    darkColor: "dark:text-emerald-400",
  },
};

// ─── Relative Time Formatting ──────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;

  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

// ─── Badge Label Mapping ───────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  subscriber_created: "Subscriber",
  payment_collected: "Payment",
  complaint_raised: "Complaint",
  complaint_resolved: "Resolved",
  invoice_generated: "Invoice",
  plan_changed: "Plan",
  device_alert: "Alert",
  installation_completed: "Install",
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  subscriber_created: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800",
  payment_collected: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-400 dark:border-teal-800",
  complaint_raised: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
  complaint_resolved: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800",
  invoice_generated: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-800",
  plan_changed: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800",
  device_alert: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",
  installation_completed: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800",
};

// ─── Loading Skeleton ──────────────────────────────────────────

function FeedSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-3 animate-pulse",
            compact ? "py-1.5" : "py-2.5"
          )}
        >
          <Skeleton
            className={cn(
              "rounded-full shrink-0",
              compact ? "h-7 w-7" : "h-9 w-9"
            )}
          />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className={cn("rounded-md", compact ? "h-3 w-32" : "h-3.5 w-40")} />
              <Skeleton className={cn("rounded-full", compact ? "h-4 w-14" : "h-5 w-16")} />
            </div>
            <Skeleton className={compact ? "h-3 w-full max-w-[200px]" : "h-3.5 w-full max-w-[280px]"} />
            <Skeleton className={compact ? "h-2.5 w-16" : "h-3 w-20"} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Activity Row ──────────────────────────────────────────────

function ActivityRow({
  item,
  index,
  compact,
}: {
  item: ActivityItem;
  index: number;
  compact: boolean;
}) {
  const config = ACTIVITY_CONFIG[item.type] || ACTIVITY_CONFIG.subscriber_created;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 animate-slide-up group",
        compact ? "py-1.5" : "py-2.5",
        "border-l-2 pl-3 rounded-r-lg transition-colors",
        config.border,
        "hover:bg-muted/40"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Icon circle */}
      <div
        className={cn(
          "rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
          config.bg,
          config.darkBg,
          compact ? "h-7 w-7" : "h-9 w-9"
        )}
      >
        <Icon
          className={cn(
            config.color,
            config.darkColor,
            compact ? "h-3.5 w-3.5" : "h-4 w-4"
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={cn(
              "font-semibold text-foreground truncate",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {item.title}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] px-1.5 py-0 leading-none shrink-0 font-medium",
              TYPE_BADGE_CLASSES[item.type] || ""
            )}
          >
            {TYPE_LABELS[item.type] || item.type}
          </Badge>
        </div>
        <p
          className={cn(
            "text-muted-foreground truncate",
            compact ? "text-[11px]" : "text-xs"
          )}
        >
          {item.description}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className={cn(
              "text-muted-foreground/70 tabular-nums",
              compact ? "text-[10px]" : "text-[11px]"
            )}
          >
            {formatRelativeTime(item.timestamp)}
          </span>
          {item.actorName && (
            <>
              <span
                className={cn(
                  "text-muted-foreground/40",
                  compact ? "text-[10px]" : "text-[11px]"
                )}
              >
                &middot;
              </span>
              <span
                className={cn(
                  "text-muted-foreground/70 font-medium",
                  compact ? "text-[10px]" : "text-[11px]"
                )}
              >
                {item.actorName}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────

function EmptyState({ compact }: { compact: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground/50">
        <Activity className={compact ? "h-8 w-8" : "h-10 w-10"} />
      </div>
      <div className="text-center space-y-1">
        <p
          className={cn(
            "font-medium text-muted-foreground",
            compact ? "text-xs" : "text-sm"
          )}
        >
          No recent activity
        </p>
        <p
          className={cn(
            "text-muted-foreground/60",
            compact ? "text-[11px]" : "text-xs"
          )}
        >
          Platform events will appear here in real time.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export function ActivityFeed({
  maxItems = 15,
  showHeader = true,
  compact = false,
  className,
}: ActivityFeedProps) {
  const { setCurrentPage } = useAppStore();

  const { data, isLoading, isError } = useQuery<{
    items: ActivityItem[];
  }>({
    queryKey: ["activity-feed", maxItems],
    queryFn: () =>
      apiFetch<{ items: ActivityItem[] }>(
        `/api/activity-feed?maxItems=${maxItems}`
      ),
    refetchInterval: 30000, // Auto-refresh every 30s
    staleTime: 15_000,
  });

  const items = data?.items ?? [];

  return (
    <Card
      className={cn(
        "animate-card-enter shadow-sm hover:shadow-md transition-shadow duration-200",
        className
      )}
    >
      {showHeader && (
        <CardHeader className={cn(compact ? "px-4 py-3" : "px-6 py-4", "gap-0 border-b border-border/50")}>
          <CardTitle
            className={cn(
              "font-semibold flex items-center gap-2 text-foreground",
              compact ? "text-sm" : "text-base"
            )}
          >
            <Activity
              className={cn(
                "text-red-500",
                compact ? "h-4 w-4" : "h-4.5 w-4.5"
              )}
            />
            Activity Feed
            <span className="live-dot ml-1" />
          </CardTitle>
          <CardAction>
            <Button
              variant="ghost"
              size={compact ? "sm" : "default"}
              className={cn(
                "gap-1 text-muted-foreground hover:text-foreground",
                compact ? "text-xs h-7 px-2" : "text-xs"
              )}
              onClick={() => setCurrentPage("Audit Log", "SETTINGS")}
            >
              View All
              <ArrowRight
                className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
              />
            </Button>
          </CardAction>
        </CardHeader>
      )}

      <CardContent
        className={cn(
          compact ? "px-3 py-2" : "px-4 py-3",
          "max-h-96 overflow-y-auto"
        )}
      >
        {isLoading ? (
          <FeedSkeleton compact={compact} />
        ) : isError ? (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">
              Failed to load activity feed.
            </p>
          </div>
        ) : items.length === 0 ? (
          <EmptyState compact={compact} />
        ) : (
          <div className="divide-y divide-border/40">
            {items.map((item, index) => (
              <ActivityRow
                key={item.id}
                item={item}
                index={index}
                compact={compact}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ActivityFeed;
