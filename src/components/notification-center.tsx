"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
  Smartphone,
  Mail,
  MessageSquare,
  Info,
  CheckCheck,
  ExternalLink,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ─── Refetch badge counts helper ───────────────────────────────

function refetchBadgeCounts() {
  fetch("/api/notifications/unread-count")
    .then((r) => r.json())
    .then((data) => {
      const store = useAppStore.getState();
      store.setUnreadNotificationCount(data.count ?? 0);
    })
    .catch(() => {});
}

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
  subscriberName?: string | null;
}

interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Notification severity type mapping ────────────────────────

type SeverityType = "info" | "success" | "warning" | "error";

function getSeverity(category: string): SeverityType {
  switch (category) {
    case "PAYMENT_CONFIRM":
    case "WELCOME":
      return "success";
    case "BILL_DUE":
    case "MAINTENANCE":
    case "DATA_USAGE":
      return "warning";
    case "OUTAGE":
      return "error";
    default:
      return "info";
  }
}

function severityDot(severity: SeverityType): string {
  switch (severity) {
    case "info":
      return "bg-teal-500";
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
  }
}

// ─── Category → Icon mapping ───────────────────────────────────

function NotificationIcon({ category, className }: { category: string; className?: string }) {
  const cls = cn("h-4 w-4", className);
  switch (category) {
    case "BILL_DUE":
      return <Banknote className={cls} />;
    case "PAYMENT_CONFIRM":
      return <CheckCircle2 className={cls} />;
    case "DATA_USAGE":
      return <Activity className={cls} />;
    case "PLAN_CHANGE":
      return <CreditCard className={cls} />;
    case "OUTAGE":
      return <AlertTriangle className={cls} />;
    case "MAINTENANCE":
      return <Wrench className={cls} />;
    case "WELCOME":
      return <UserPlus className={cls} />;
    default:
      return <Bell className={cls} />;
  }
}

function categoryBgColor(category: string): string {
  switch (category) {
    case "BILL_DUE":
      return "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
    case "PAYMENT_CONFIRM":
      return "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "DATA_USAGE":
      return "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400";
    case "PLAN_CHANGE":
      return "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400";
    case "OUTAGE":
      return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
    case "MAINTENANCE":
      return "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400";
    case "WELCOME":
      return "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400";
    default:
      return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  }
}

// ─── Type icon (delivery channel) ──────────────────────────────

function DeliveryTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "SMS":
      return <Smartphone className="h-3 w-3" />;
    case "EMAIL":
      return <Mail className="h-3 w-3" />;
    case "WHATSAPP":
      return <MessageSquare className="h-3 w-3" />;
    case "PUSH":
      return <BellRing className="h-3 w-3" />;
    default:
      return <Info className="h-3 w-3" />;
  }
}

// ─── Time grouping ─────────────────────────────────────────────

function groupNotificationsByTime(items: NotificationItem[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const today: NotificationItem[] = [];
  const yesterday: NotificationItem[] = [];
  const thisWeek: NotificationItem[] = [];
  const earlier: NotificationItem[] = [];

  for (const item of items) {
    const itemDate = new Date(item.createdAt);
    if (itemDate >= todayStart) {
      today.push(item);
    } else if (itemDate >= yesterdayStart) {
      yesterday.push(item);
    } else if (itemDate >= weekStart) {
      thisWeek.push(item);
    } else {
      earlier.push(item);
    }
  }

  return { today, yesterday, thisWeek, earlier };
}

// ─── Skeleton loader ──────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Skeleton className="h-9 w-9 rounded-lg shrink-0 skeleton-wave" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-3.5 w-3/4 skeleton-wave" />
        <Skeleton className="h-3 w-full skeleton-wave" />
        <Skeleton className="h-2.5 w-20 skeleton-wave" />
      </div>
    </div>
  );
}

// ─── Notification row ─────────────────────────────────────────

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: NotificationItem;
  onMarkRead: (id: string) => void;
}) {
  const isRead = notification.readAt !== null;
  const cat = notification.category || "OTHER";
  const nType = notification.type || "IN_APP";
  const severity = getSeverity(cat);

  return (
    <button
      className={cn(
        "flex items-start gap-3 w-full px-4 py-3 text-left transition-colors cursor-pointer group border-l-[3px]",
        isRead
          ? "hover:bg-muted/30 border-l-transparent"
          : "hover:bg-muted/50 bg-muted/20 border-l-red-500"
      )}
      onClick={() => {
        if (!isRead) onMarkRead(notification.id);
      }}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex items-center justify-center h-9 w-9 rounded-lg transition-transform",
            categoryBgColor(cat)
          )}
        >
          <NotificationIcon category={cat} />
        </div>
        {!isRead && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-background",
              severityDot(severity)
            )}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {!isRead && (
            <span className="shrink-0 w-2 h-2 rounded-full bg-red-500 mt-0.5" />
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
          <span className="shrink-0 text-muted-foreground/60">
            <DeliveryTypeIcon type={nType} />
          </span>
        </div>
        <p
          className={cn(
            "text-xs mt-0.5 line-clamp-2",
            isRead ? "text-muted-foreground/60" : "text-muted-foreground"
          )}
        >
          {notification.message}
        </p>
        {notification.subscriberName && (
          <p className="text-[10px] text-muted-foreground/50 mt-1 truncate">
            For: {notification.subscriberName}
          </p>
        )}
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

// ─── Group header ─────────────────────────────────────────────

function GroupHeader({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 h-4 font-medium"
      >
        {count}
      </Badge>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <div className="p-4 rounded-2xl bg-muted/50 text-muted-foreground/50 mb-3">
        <Bell className="h-10 w-10" />
      </div>
      <p className="text-sm font-medium">No notifications yet</p>
      <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px] text-center">
        Notifications will appear here when events occur.
      </p>
    </div>
  );
}

// ─── Notification list renderer ──────────────────────────────

function NotificationList({
  notifications,
  isLoading,
  onMarkRead,
}: {
  notifications: NotificationItem[];
  isLoading: boolean;
  onMarkRead: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <NotificationSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return <EmptyState />;
  }

  const { today, yesterday, thisWeek, earlier } = groupNotificationsByTime(notifications);

  // Separate unread and read for divider
  const unreadNotifs = notifications.filter((n) => n.readAt === null);
  const readNotifs = notifications.filter((n) => n.readAt !== null);

  return (
    <div className="divide-y divide-border/40">
      {today.length > 0 && (
        <>
          <GroupHeader label="Today" count={today.length} />
          {today.map((notif) => (
            <NotificationRow key={notif.id} notification={notif} onMarkRead={onMarkRead} />
          ))}
        </>
      )}
      {yesterday.length > 0 && (
        <>
          <GroupHeader label="Yesterday" count={yesterday.length} />
          {yesterday.map((notif) => (
            <NotificationRow key={notif.id} notification={notif} onMarkRead={onMarkRead} />
          ))}
        </>
      )}
      {thisWeek.length > 0 && (
        <>
          <GroupHeader label="This Week" count={thisWeek.length} />
          {thisWeek.map((notif) => (
            <NotificationRow key={notif.id} notification={notif} onMarkRead={onMarkRead} />
          ))}
        </>
      )}
      {earlier.length > 0 && (
        <>
          <GroupHeader label="Earlier" count={earlier.length} />
          {earlier.map((notif) => (
            <NotificationRow key={notif.id} notification={notif} onMarkRead={onMarkRead} />
          ))}
        </>
      )}
      {/* Visual divider between unread and read */}
      {unreadNotifs.length > 0 && readNotifs.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2">
          <Separator className="flex-1" />
          <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Read</span>
          <Separator className="flex-1" />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function NotificationCenter({
  open,
  onOpenChange,
}: NotificationCenterProps) {
  const { setCurrentPage } = useAppStore();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState("all");

  // Fetch notifications with limit=50, auto-refresh every 30s when open
  const { data, isLoading } = useQuery<{
    items: NotificationItem[];
    pagination: { total: number };
  }>({
    queryKey: ["notifications-center", activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (activeFilter === "unread") {
        params.set("status", "PENDING");
      }
      const res = await fetch(`/api/notifications?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: open,
    staleTime: 15_000,
    refetchInterval: open ? 30_000 : false,
  });

  const allNotifications = data?.items ?? [];
  const totalCount = data?.pagination?.total ?? 0;
  const unreadCount = allNotifications.filter((n) => n.readAt === null).length;

  // Client-side filter based on active tab
  const filteredNotifications =
    activeFilter === "all"
      ? allNotifications
      : activeFilter === "unread"
        ? allNotifications.filter((n) => n.readAt === null)
        : allNotifications.filter(
            (n) => getSeverity(n.category || "OTHER") === activeFilter
          );

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["notifications-center"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-header"] });
      refetchBadgeCounts();
      toast.success(`Marked ${data.updatedCount ?? "all"} notifications as read`);
    },
    onError: () => {
      toast.error("Failed to mark all as read");
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[320px] sm:w-[380px] md:w-[420px] p-0 flex flex-col gap-0 overflow-hidden data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-300"
      >
        {/* ── Header: Title + Summary ── */}
        <SheetHeader className="p-4 pb-2 border-b border-border/50 space-y-0">
          <div className="flex items-center gap-2.5 pr-6">
            <div className="p-1.5 rounded-lg bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <SheetTitle className="text-base">Notifications</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {unreadCount > 0
                  ? `${unreadCount} unread of ${totalCount} total`
                  : `${totalCount} total notifications`}
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* ── Filter Tabs ── */}
        <div className="px-4 pt-3 pb-2">
          <Tabs value={activeFilter} onValueChange={setActiveFilter}>
            <TabsList className="w-full h-8 p-0.5 bg-muted/80">
              <TabsTrigger
                value="all"
                className="text-xs h-7 flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                value="unread"
                className="text-xs h-7 flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm relative"
              >
                Unread
                {unreadCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-bold leading-none bg-red-500 text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="info"
                className="text-xs h-7 flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Info className="h-3 w-3 text-teal-500" />
              </TabsTrigger>
              <TabsTrigger
                value="success"
                className="text-xs h-7 flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <CheckCircle className="h-3 w-3 text-emerald-500" />
              </TabsTrigger>
              <TabsTrigger
                value="warning"
                className="text-xs h-7 flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <AlertTriangle className="h-3 w-3 text-amber-500" />
              </TabsTrigger>
              <TabsTrigger
                value="error"
                className="text-xs h-7 flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <AlertCircle className="h-3 w-3 text-red-500" />
              </TabsTrigger>
            </TabsList>
            {/* TabsContent needed for Radix Tabs (hidden — actual list is below) */}
            <TabsContent value="all" className="sr-only" />
            <TabsContent value="unread" className="sr-only" />
            <TabsContent value="info" className="sr-only" />
            <TabsContent value="success" className="sr-only" />
            <TabsContent value="warning" className="sr-only" />
            <TabsContent value="error" className="sr-only" />
          </Tabs>
        </div>

        {/* ── Action bar ── */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7"
            onClick={() => markAllMutation.mutate()}
            disabled={unreadCount === 0 || markAllMutation.isPending}
          >
            {markAllMutation.isPending ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            Mark All Read
          </Button>
          <span className="text-[10px] text-muted-foreground/50">
            {filteredNotifications.length} shown
          </span>
        </div>

        {/* ── Scrollable Notification List ── */}
        <ScrollArea className="flex-1 min-h-0 notification-scrollbar">
          <NotificationList
            notifications={filteredNotifications}
            isLoading={isLoading}
            onMarkRead={markAsRead}
          />
        </ScrollArea>

        {/* ── Footer ── */}
        <Separator />
        <div className="px-4 py-3 shrink-0">
          <button
            className="flex items-center gap-1.5 w-full text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
            onClick={() => {
              onOpenChange(false);
              setCurrentPage("Notifications", "SETTINGS");
            }}
          >
            <ExternalLink className="h-3 w-3" />
            View All Notifications
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default NotificationCenter;
