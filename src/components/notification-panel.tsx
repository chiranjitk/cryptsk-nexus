"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  UserPlus,
  Activity,
  Wrench,
  Banknote,
  Info,
  CheckCheck,
  ExternalLink,
  XCircle,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ─────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  status: string;
  readAt: string | null;
  createdAt: string;
  buttonUrl?: string;
  subscriberName?: string | null;
  userId?: string | null;
}

// ─── Constants ─────────────────────────────────────────────────

const emptySubscribe = () => () => {};
const UNREAD_REFRESH_INTERVAL = 30_000;

// ─── Severity helpers ──────────────────────────────────────────

type Severity = "critical" | "warning" | "info" | "success";

function getSeverity(category: string): Severity {
  switch (category) {
    case "OUTAGE":
      return "critical";
    case "BILL_DUE":
    case "MAINTENANCE":
    case "DATA_USAGE":
      return "warning";
    case "PAYMENT_CONFIRM":
    case "WELCOME":
      return "success";
    default:
      return "info";
  }
}

function severityBorderColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "border-l-red-500";
    case "warning":
      return "border-l-amber-500";
    case "info":
      return "border-l-teal-500";
    case "success":
      return "border-l-emerald-500";
  }
}

function severityIconBg(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
    case "warning":
      return "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
    case "info":
      return "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400";
    case "success":
      return "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400";
  }
}

// ─── Category → Icon mapping ───────────────────────────────────

function CategoryIcon({ category, severity, className }: { category: string; severity: Severity; className?: string }) {
  const cls = cn("h-4 w-4", className);
  // Use severity-based icons for clearer visual distinction
  switch (severity) {
    case "critical":
      return <XCircle className={cls} />;
    case "warning":
      return <AlertTriangle className={cls} />;
    case "success":
      return <CheckCircle2 className={cls} />;
    case "info":
      break;
  }
  // Fallback to category-specific icons
  switch (category) {
    case "BILL_DUE":
      return <Banknote className={cls} />;
    case "DATA_USAGE":
      return <Activity className={cls} />;
    case "PLAN_CHANGE":
      return <CreditCard className={cls} />;
    case "MAINTENANCE":
      return <Wrench className={cls} />;
    case "WELCOME":
      return <UserPlus className={cls} />;
    default:
      return <Info className={cls} />;
  }
}

// ─── Refetch helper ────────────────────────────────────────────

function refetchBadgeCounts() {
  fetch("/api/notifications/unread-count", { credentials: "include" })
    .then((r) => r.json())
    .then((data) => {
      useAppStore.getState().setUnreadNotificationCount(data.count ?? 0);
    })
    .catch(() => {});
}

// ─── Skeleton loader ──────────────────────────────────────────

function PanelSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2.5">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0 skeleton-wave" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-4/5 skeleton-wave" />
            <Skeleton className="h-3 w-full skeleton-wave" />
            <Skeleton className="h-2.5 w-16 skeleton-wave" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground/50 mb-3">
        <Bell className="h-8 w-8" />
      </div>
      <p className="text-sm font-medium">No notifications yet</p>
      <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px] text-center">
        Notifications will appear here when events occur.
      </p>
    </div>
  );
}

// ─── Notification row ─────────────────────────────────────────

function NotificationRow({
  notification,
  onMarkRead,
  onClose,
}: {
  notification: NotificationItem;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  const { setCurrentPage } = useAppStore();
  const isRead = notification.readAt !== null;
  const cat = notification.category || "OTHER";
  const severity = getSeverity(cat);

  const handleClick = useCallback(() => {
    if (!isRead) onMarkRead(notification.id);
    // Navigate if a link is available
    const link = notification.buttonUrl;
    if (link) {
      setCurrentPage("Notifications", "SETTINGS");
    } else if (notification.title.includes("SLA Escalation")) {
      setCurrentPage("Complaints", "OPERATIONS");
    } else if (notification.title.includes("Retention")) {
      setCurrentPage("Audit Log", "SETTINGS");
    } else if (cat === "BILL_DUE" || cat === "PAYMENT_CONFIRM") {
      setCurrentPage("Billing", "FINANCE");
    } else if (cat === "OUTAGE" || cat === "MAINTENANCE") {
      setCurrentPage("Network", "NETWORK");
    } else if (notification.subscriberName) {
      setCurrentPage("Subscribers", "MAIN");
    }
    onClose();
  }, [isRead, notification.id, notification.buttonUrl, notification.title, cat, notification.subscriberName, onMarkRead, onClose, setCurrentPage]);

  return (
    <button
      className={cn(
        "flex items-start gap-3 w-full text-left transition-colors cursor-pointer rounded-md border-l-[3px] px-3 py-2.5",
        severityBorderColor(severity),
        isRead
          ? "hover:bg-muted/30 opacity-70"
          : "hover:bg-muted/50 bg-muted/20"
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        <div
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-lg transition-transform",
            severityIconBg(severity)
          )}
        >
          <CategoryIcon category={cat} severity={severity} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {!isRead && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
          <p
            className={cn(
              "text-sm truncate",
              isRead
                ? "text-muted-foreground font-normal"
                : "text-foreground font-medium"
            )}
          >
            {notification.title}
          </p>
          {/* System-sourced: staff-targeted automation events (escalations, retention sweeps) */}
          {notification.userId && !notification.subscriberName && (
            <span
              title="Generated by platform automation"
              className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50"
            >
              System
            </span>
          )}
        </div>
        <p
          className={cn(
            "text-xs mt-0.5 line-clamp-2",
            isRead ? "text-muted-foreground/60" : "text-muted-foreground"
          )}
        >
          {notification.message}
        </p>
        <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground/60">
          <Clock className="h-3 w-3" />
          <span>
            {formatDistanceToNow(new Date(notification.createdAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function NotificationPanel() {
  const { unreadNotificationCount } = useAppStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Mounted detection for hydration safety
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Auto-refresh unread count every 30s
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    refetchBadgeCounts();
    refreshIntervalRef.current = setInterval(refetchBadgeCounts, UNREAD_REFRESH_INTERVAL);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, []);

  // Fetch recent notifications for the panel
  const { data, isLoading, isError } = useQuery<{
    items: NotificationItem[];
  }>({
    queryKey: ["notifications-panel"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=10", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: open,
    staleTime: 15_000,
    refetchInterval: open ? 30_000 : false,
  });

  const notifications = data?.items ?? [];

  // Re-fetch unread count when panel opens
  useEffect(() => {
    if (open) refetchBadgeCounts();
  }, [open]);

  // Rendering an in-app notification IS its delivery: flip PENDING → DELIVERED
  // once per panel open so the Notifications history page reflects reality.
  useEffect(() => {
    if (!open) return;
    fetch("/api/notifications/mark-delivered", {
      method: "POST",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.updated > 0) {
          queryClient.invalidateQueries({ queryKey: ["notifications-center"] });
          queryClient.invalidateQueries({ queryKey: ["notifications-header"] });
        }
      })
      .catch(() => {});
  }, [open, queryClient]);

  // Mark single notification as read
  const markAsRead = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/notifications/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "READ" }),
          credentials: "include",
        });
        queryClient.invalidateQueries({ queryKey: ["notifications-panel"] });
        queryClient.invalidateQueries({ queryKey: ["notifications-center"] });
        queryClient.invalidateQueries({ queryKey: ["notifications-header"] });
        refetchBadgeCounts();
      } catch {
        // Silently fail
      }
    },
    [queryClient]
  );

  // Mark all as read
  const markAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-panel"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-center"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-header"] });
      refetchBadgeCounts();
    },
  });

  const unreadInPanel = notifications.filter((n) => n.readAt === null).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-9 w-9 transition-all duration-200",
            unreadNotificationCount > 0
              ? "text-primary bg-primary/5 hover:bg-primary/10 hover:text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label={
            unreadNotificationCount > 0
              ? `${unreadNotificationCount} unread notification${unreadNotificationCount > 1 ? "s" : ""}`
              : "Notifications"
          }
        >
          {unreadNotificationCount > 0 ? (
            <BellRing className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {mounted && unreadNotificationCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-none bg-red-500 text-white",
                unreadNotificationCount <= 99 && "animate-badge-pulse"
              )}
            >
              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
              {unreadNotificationCount <= 99 && (
                <span className="absolute inset-0 rounded-full animate-ping bg-red-500 opacity-40" />
              )}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] sm:w-[420px] p-0 flex flex-col gap-0 overflow-hidden max-h-[480px]"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {mounted && unreadNotificationCount > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {unreadNotificationCount} unread
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7"
            onClick={() => markAllMutation.mutate()}
            disabled={unreadInPanel === 0 || markAllMutation.isPending}
          >
            {markAllMutation.isPending ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            Mark all read
          </Button>
        </div>

        {/* ── Scrollable list ── */}
        <div className="max-h-96 overflow-y-auto notification-scrollbar">
          {isLoading && <PanelSkeleton />}

          {isError && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <XCircle className="h-8 w-8 text-red-400 mb-2" />
              <p className="text-sm font-medium">Failed to load</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Could not fetch notifications.
              </p>
            </div>
          )}

          {!isLoading && !isError && notifications.length === 0 && <EmptyState />}

          {!isLoading && !isError && notifications.length > 0 && (
            <div className="py-1">
              {notifications.map((notif) => (
                <NotificationRow
                  key={notif.id}
                  notification={notif}
                  onMarkRead={markAsRead}
                  onClose={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <Separator />
        <div className="px-4 py-2.5 shrink-0">
          <button
            className="flex items-center gap-1.5 w-full text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            onClick={() => {
              setOpen(false);
              useAppStore.getState().setCurrentPage("Notifications", "SETTINGS");
            }}
          >
            <ExternalLink className="h-3 w-3" />
            View all notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationPanel;
