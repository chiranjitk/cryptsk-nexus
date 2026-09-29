"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  Radio,
  RefreshCw,
  ArrowRight,
  UserPlus,
  CreditCard,
  MessageSquare,
  AlertTriangle,
  LogIn,
  LogOut,
  FileText,
  Pencil,
  Trash2,
  Wrench,
  Shield,
  Activity,
  Download,
  ArrowRightLeft,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ─────────────────────────────────────────────────────

interface ActivityFeedItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  actorName?: string;
  metadata?: Record<string, string>;
  action?: string;
  entity?: string;
  entityId?: string;
}

// ─── Action Category & Color Mapping ───────────────────────────

type ActionCategory =
  | "subscriber_created"
  | "payment_collected"
  | "complaint_raised"
  | "complaint_resolved"
  | "invoice_generated"
  | "installation_completed"
  | "device_alert"
  | "plan_changed"
  | "user_login"
  | "default";

function getActivityCategory(item: ActivityFeedItem): ActionCategory {
  // Use the `type` field first (already mapped by the API)
  const type = item.type?.toLowerCase() || "";
  if (type.includes("subscriber_created") || type.includes("subscriber")) return "subscriber_created";
  if (type.includes("payment_collected") || type.includes("payment")) return "payment_collected";
  if (type.includes("complaint_raised") || type.includes("complaint")) return "complaint_raised";
  if (type.includes("complaint_resolved")) return "complaint_resolved";
  if (type.includes("invoice_generated") || type.includes("invoice")) return "invoice_generated";
  if (type.includes("installation_completed") || type.includes("installation")) return "installation_completed";
  if (type.includes("device_alert") || type.includes("device")) return "device_alert";
  if (type.includes("plan_changed") || type.includes("plan")) return "plan_changed";
  if (type.includes("user_login") || type.includes("login") || type.includes("logout")) return "user_login";

  // Fallback: derive from action
  const action = (item.action || "").toUpperCase();
  if (action === "CREATE" || action === "BULK_CREATE") {
    const entity = (item.entity || "").toLowerCase();
    if (entity.includes("subscriber") || entity.includes("lead")) return "subscriber_created";
    if (entity.includes("payment")) return "payment_collected";
    if (entity.includes("complaint")) return "complaint_raised";
    if (entity.includes("invoice")) return "invoice_generated";
    return "subscriber_created";
  }
  if (action === "PAYMENT" || action === "VERIFICATION" || action === "INVOICE_PAID") return "payment_collected";
  if (action === "STATUS_CHANGE" || action === "ASSIGN" || action === "CONFIG_CHANGE") return "plan_changed";
  if (action === "DELETE" || action === "REJECTION" || action === "PURGE") return "device_alert";
  if (action.includes("LOGIN") || action.includes("LOGOUT") || action === "PASSWORD_CHANGE") return "user_login";

  return "default";
}

const CATEGORY_STYLES: Record<ActionCategory, {
  dotColor: string;
  iconBg: string;
  iconColor: string;
  darkDotColor: string;
  darkIconBg: string;
  darkIconColor: string;
}> = {
  subscriber_created: {
    dotColor: "bg-emerald-500",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    darkDotColor: "dark:bg-emerald-400",
    darkIconBg: "dark:bg-emerald-950/40",
    darkIconColor: "dark:text-emerald-400",
  },
  payment_collected: {
    dotColor: "bg-green-500",
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    darkDotColor: "dark:bg-green-400",
    darkIconBg: "dark:bg-green-950/40",
    darkIconColor: "dark:text-green-400",
  },
  complaint_raised: {
    dotColor: "bg-red-500",
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    darkDotColor: "dark:bg-red-400",
    darkIconBg: "dark:bg-red-950/40",
    darkIconColor: "dark:text-red-400",
  },
  complaint_resolved: {
    dotColor: "bg-teal-500",
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    darkDotColor: "dark:bg-teal-400",
    darkIconBg: "dark:bg-teal-950/40",
    darkIconColor: "dark:text-teal-400",
  },
  invoice_generated: {
    dotColor: "bg-amber-500",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    darkDotColor: "dark:bg-amber-400",
    darkIconBg: "dark:bg-amber-950/40",
    darkIconColor: "dark:text-amber-400",
  },
  installation_completed: {
    dotColor: "bg-orange-500",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    darkDotColor: "dark:bg-orange-400",
    darkIconBg: "dark:bg-orange-950/40",
    darkIconColor: "dark:text-orange-400",
  },
  device_alert: {
    dotColor: "bg-rose-500",
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
    darkDotColor: "dark:bg-rose-400",
    darkIconBg: "dark:bg-rose-950/40",
    darkIconColor: "dark:text-rose-400",
  },
  plan_changed: {
    dotColor: "bg-yellow-500",
    iconBg: "bg-yellow-50",
    iconColor: "text-yellow-600",
    darkDotColor: "dark:bg-yellow-400",
    darkIconBg: "dark:bg-yellow-950/40",
    darkIconColor: "dark:text-yellow-400",
  },
  user_login: {
    dotColor: "bg-slate-400",
    iconBg: "bg-slate-50",
    iconColor: "text-slate-500",
    darkDotColor: "dark:bg-slate-500",
    darkIconBg: "dark:bg-slate-800/40",
    darkIconColor: "dark:text-slate-400",
  },
  default: {
    dotColor: "bg-gray-400",
    iconBg: "bg-gray-50",
    iconColor: "text-gray-500",
    darkDotColor: "dark:bg-gray-500",
    darkIconBg: "dark:bg-gray-800/40",
    darkIconColor: "dark:text-gray-400",
  },
};

// ─── Icon resolver (static map to avoid react-hooks/static-components lint) ──

const CATEGORY_ICON_MAP: Record<ActionCategory, React.ElementType> = {
  subscriber_created: UserPlus,
  payment_collected: CreditCard,
  complaint_raised: MessageSquare,
  complaint_resolved: Activity,
  invoice_generated: FileText,
  installation_completed: Wrench,
  device_alert: AlertTriangle,
  plan_changed: ArrowRightLeft,
  user_login: LogIn,
};

function getCategoryIcon(category: ActionCategory): React.ElementType {
  return CATEGORY_ICON_MAP[category] || Activity;
}

// ─── Relative Time ─────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;

    // Less than 1 minute
    if (diffMs < 60_000) return "just now";

    // Less than 1 hour
    if (diffMs < 3_600_000) {
      const mins = Math.floor(diffMs / 60_000);
      return `${mins}m ago`;
    }

    // Less than 24 hours
    if (diffMs < 86_400_000) {
      const hrs = Math.floor(diffMs / 3_600_000);
      return `${hrs}h ago`;
    }

    // Less than 2 days
    if (diffMs < 172_800_000) return "Yesterday";

    // Fallback to date-fns for longer periods
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

// ─── Skeleton ──────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5 px-1">
          <div className="flex-shrink-0">
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
            <Skeleton className="h-2.5 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground/50">
        <Radio className="h-8 w-8" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          No recent activity
        </p>
        <p className="text-xs text-muted-foreground/60">
          Platform events will appear here as they happen.
        </p>
      </div>
    </div>
  );
}

// ─── Activity Item Row ─────────────────────────────────────────

function ActivityItem({
  item,
  index,
}: {
  item: ActivityFeedItem;
  index: number;
}) {
  const category = getActivityCategory(item);
  const styles = CATEGORY_STYLES[category];
  const categoryIcon = getCategoryIcon(category);

  return (
    <div
      className="flex items-start gap-3 py-2.5 px-1 rounded-lg transition-colors hover:bg-muted/50 animate-slide-up"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      {/* Icon with colored background */}
      <div
        className={cn(
          "flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg",
          styles.iconBg,
          styles.darkIconBg,
          "transition-transform hover:scale-110"
        )}
      >
        {React.createElement(categoryIcon, { className: cn("h-4 w-4", styles.iconColor, styles.darkIconColor) })}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {/* Colored dot indicator */}
          <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", styles.dotColor, styles.darkDotColor)} />
          <p className="text-xs font-medium text-foreground truncate">
            {item.title}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
          {item.description}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {formatRelativeTime(item.timestamp)}
          </span>
          {item.actorName && (
            <>
              <span className="text-[10px] text-muted-foreground/30">&middot;</span>
              <span className="text-[10px] text-muted-foreground/60 font-medium">
                {item.actorName}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Widget ───────────────────────────────────────────────

export function LiveActivityFeedWidget() {
  const { setCurrentPage } = useAppStore();
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchActivity = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setIsFetching(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await fetch("/api/activity-feed?maxItems=20", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setItems(data.items || []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Failed to fetch activity feed:", err);
      if (!isBackground) {
        setError("Failed to load activity feed");
      }
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchActivity(false);
  }, [fetchActivity]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchActivity(true);
    }, 15_000);

    return () => clearInterval(interval);
  }, [fetchActivity]);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter overflow-hidden">
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 p-1.5 text-white shadow-sm">
              <Radio className="h-3.5 w-3.5" />
            </div>
            Live Activity Feed
            {/* Pulsing green dot + LIVE indicator */}
            <span className="flex items-center gap-1 ml-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400">
                LIVE
              </span>
            </span>
          </CardTitle>

          <div className="flex items-center gap-1">
            {/* Refresh button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => fetchActivity(false)}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  isFetching && "animate-spin"
                )}
              />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* ── Body ── */}
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-950/30 text-red-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 mt-1"
              onClick={() => fetchActivity(false)}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div
              className={cn(
                "max-h-[420px] overflow-y-auto pr-1",
                "scrollbar-thin scrollbar-thumb-rounded-full",
                "scrollbar-thumb-border/40 scrollbar-track-transparent",
                "hover:scrollbar-thumb-border/60",
                "divide-y divide-border/30"
              )}
            >
              {items.map((item, index) => (
                <ActivityItem
                  key={item.id}
                  item={item}
                  index={index}
                />
              ))}
            </div>

            {/* ── View All + Footer ── */}
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
              {lastRefreshed && (
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                  Updated {formatRelativeTime(lastRefreshed.toISOString())}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 px-2 ml-auto"
                onClick={() => setCurrentPage("Audit Log", "SETTINGS")}
              >
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default LiveActivityFeedWidget;
