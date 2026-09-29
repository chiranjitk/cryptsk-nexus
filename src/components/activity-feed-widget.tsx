"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { apiFetch, cn, safeJsonParse } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  Settings,
  FileText,
  CreditCard,
  MessageSquare,
  UserPlus,
  CheckCircle,
  ArrowRightLeft,
  AlertTriangle,
  Wrench,
  Shield,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface ActivityFeedWidgetProps {
  maxItems?: number;
  className?: string;
}

// ─── Action Type Color Config ──────────────────────────────────

type ActionCategory = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "DEFAULT";

function getActionCategory(action?: string): ActionCategory {
  if (!action) return "DEFAULT";
  const upper = action.toUpperCase();
  if (upper.includes("CREATE") || upper.startsWith("BULK_CREATE")) return "CREATE";
  if (upper.includes("UPDATE") || upper.startsWith("BULK_UPDATE") || upper === "STATUS_CHANGE" || upper === "PLAN_CHANGE" || upper === "ASSIGN" || upper === "CONFIG_CHANGE") return "UPDATE";
  if (upper.includes("DELETE") || upper.startsWith("BULK_DELETE") || upper === "REJECTION" || upper === "PURGE") return "DELETE";
  if (upper === "LOGIN" || upper === "LOGIN_FAILED" || upper === "LOGOUT" || upper === "PASSWORD_CHANGE") return "LOGIN";
  return "DEFAULT";
}

const ACTION_COLORS: Record<ActionCategory, {
  dot: string;
  icon: string;
  darkDot: string;
  darkIcon: string;
}> = {
  CREATE: {
    dot: "bg-green-500",
    icon: "text-green-600",
    darkDot: "dark:bg-green-400",
    darkIcon: "dark:text-green-400",
  },
  UPDATE: {
    dot: "bg-amber-500",
    icon: "text-amber-600",
    darkDot: "dark:bg-amber-400",
    darkIcon: "dark:text-amber-400",
  },
  DELETE: {
    dot: "bg-red-500",
    icon: "text-red-600",
    darkDot: "dark:bg-red-400",
    darkIcon: "dark:text-red-400",
  },
  LOGIN: {
    dot: "bg-teal-500",
    icon: "text-teal-600",
    darkDot: "dark:bg-teal-400",
    darkIcon: "dark:text-teal-400",
  },
  DEFAULT: {
    dot: "bg-gray-400",
    icon: "text-gray-500",
    darkDot: "dark:bg-gray-500",
    darkIcon: "dark:text-gray-400",
  },
};

// ─── Icon Key Resolver (pure function, returns string key) ───────

function getActionIconKey(action?: string, entity?: string): string {
  if (!action) return "default";

  const upper = action.toUpperCase();

  // Login/logout
  if (upper === "LOGIN" || upper === "LOGIN_FAILED") return "login";
  if (upper === "LOGOUT") return "logout";
  if (upper === "PASSWORD_CHANGE") return "password";

  // Create actions
  if (upper === "CREATE" || upper.startsWith("BULK_CREATE")) {
    const el = (entity || "").toLowerCase();
    if (el.includes("subscriber") || el.includes("lead")) return "user-plus";
    if (el.includes("payment")) return "credit-card";
    if (el.includes("invoice")) return "file-text";
    if (el.includes("complaint")) return "message-square";
    if (el.includes("installation")) return "wrench";
    if (el.includes("incident")) return "alert-triangle";
    return "plus";
  }

  // Update actions
  if (upper === "UPDATE" || upper.startsWith("BULK_UPDATE") || upper === "CONFIG_CHANGE") {
    return "pencil";
  }
  if (upper === "STATUS_CHANGE" || upper === "ASSIGN") {
    return "swap";
  }
  if (upper === "PLAN_CHANGE") return "swap";

  // Delete actions
  if (upper === "DELETE" || upper.startsWith("BULK_DELETE") || upper === "PURGE") {
    return "trash";
  }

  // Payment/invoice
  if (upper === "PAYMENT" || upper === "VERIFICATION" || upper === "INVOICE_PAID") return "credit-card";
  if (upper === "REJECTION") return "alert-triangle";
  if (upper === "INVOICE_GENERATE") return "file-text";

  // Other
  if (upper === "EXPORT" || upper === "DOWNLOAD") return "download";

  return "default";
}

// ─── Icon Renderer (declared outside component render) ─────────

const ICON_MAP: Record<string, React.ElementType> = {
  "default": Activity,
  "login": LogIn,
  "logout": LogOut,
  "password": Shield,
  "user-plus": UserPlus,
  "credit-card": CreditCard,
  "file-text": FileText,
  "message-square": MessageSquare,
  "wrench": Wrench,
  "alert-triangle": AlertTriangle,
  "plus": Plus,
  "pencil": Pencil,
  "swap": ArrowRightLeft,
  "trash": Trash2,
  "download": Download,
};

function ActionIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const Comp = ICON_MAP[iconKey] || ICON_MAP["default"];
  return <Comp className={className} />;
}

// ─── Navigation Helpers ────────────────────────────────────────

function getNavigationTarget(item: ActivityFeedItem): { page: string; section: string } | null {
  const entity = (item.entity || "").toLowerCase();
  const action = (item.action || "").toUpperCase();
  const metadata = item.metadata || {};

  // Subscribers
  if (entity.includes("subscriber")) {
    return { page: "Subscribers", section: "MAIN" };
  }

  // Payments
  if (entity.includes("payment")) {
    if (action.includes("DELETE") || action === "REJECTION") {
      return { page: "Payments", section: "MAIN" };
    }
    return { page: "Payments", section: "MAIN" };
  }

  // Invoices
  if (entity.includes("invoice")) {
    return { page: "Invoices", section: "MAIN" };
  }

  // Complaints
  if (entity.includes("complaint")) {
    if (action === "CREATE" || action.includes("DELETE")) {
      return { page: "Complaints", section: "OPERATIONS" };
    }
    return { page: "Complaints", section: "OPERATIONS" };
  }

  // Plans
  if (entity.includes("plan") && !entity.includes("maintenance")) {
    return { page: "Plans", section: "MAIN" };
  }

  // Installations
  if (entity.includes("installation")) {
    return { page: "Installations", section: "OPERATIONS" };
  }

  // Devices
  if (entity.includes("device") || entity.includes("router") || entity.includes("switch") || entity.includes("olt") || entity.includes("onu") || entity.includes("ap")) {
    return { page: "Devices", section: "NETWORK" };
  }

  // Incidents
  if (entity.includes("incident")) {
    return { page: "Incidents", section: "OPERATIONS" };
  }

  // Maintenance
  if (entity.includes("maintenance")) {
    return { page: "Incidents", section: "OPERATIONS" };
  }

  // Leads
  if (entity.includes("lead")) {
    return { page: "Leads", section: "OPERATIONS" };
  }

  // Users / Auth
  if (entity.includes("auth") || entity.includes("user") || action === "LOGIN" || action === "LOGOUT" || action === "PASSWORD_CHANGE") {
    return { page: "Users", section: "SETTINGS" };
  }

  // MultiWAN / Config
  if (entity.includes("multiwan") || entity.includes("radius") || entity.includes("hotspot")) {
    return { page: "Devices", section: "NETWORK" };
  }

  // Notifications
  if (entity.includes("notification")) {
    return { page: "Notifications", section: "SETTINGS" };
  }

  // Backup / Restore
  if (action === "BACKUP" || action === "RESTORE") {
    return { page: "ISP Settings", section: "SETTINGS" };
  }

  return null;
}

// ─── Relative Time ─────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

// ─── Skeleton ──────────────────────────────────────────────────

function WidgetSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5 px-1 animate-pulse">
          <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-1.5 w-1.5 rounded-full" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
            <Skeleton className="h-2.5 w-20 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground/50">
        <Activity className="h-10 w-10" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          No recent activity
        </p>
        <p className="text-xs text-muted-foreground/60">
          Platform events will appear here in real time.
        </p>
      </div>
    </div>
  );
}

// ─── Feed Item ─────────────────────────────────────────────────

function FeedItem({
  item,
  index,
  onClick,
}: {
  item: ActivityFeedItem;
  index: number;
  onClick: () => void;
}) {
  const category = getActionCategory(item.action);
  const colors = ACTION_COLORS[category];
  const iconKey = getActionIconKey(item.action, item.entity);
  const navigable = getNavigationTarget(item) !== null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 py-2.5 px-1 rounded-lg transition-colors animate-slide-up text-left",
        "hover:bg-muted/50",
        navigable && "cursor-pointer",
        !navigable && "cursor-default"
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Timeline dot + icon */}
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        <div
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center",
            "bg-muted/80",
            "transition-transform group-hover:scale-110"
          )}
        >
          <ActionIcon
            iconKey={iconKey}
            className={cn(
              "h-3.5 w-3.5",
              colors.icon,
              colors.darkIcon
            )}
          />
        </div>
        <div className={cn("h-1.5 w-1.5 rounded-full", colors.dot, colors.darkDot)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-foreground truncate">
            {item.title}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] px-1.5 py-0 leading-none shrink-0 font-medium border-transparent",
              category === "CREATE" && "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
              category === "UPDATE" && "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
              category === "DELETE" && "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
              category === "LOGIN" && "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400",
              category === "DEFAULT" && "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400"
            )}
          >
            {(item.action || item.type).replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {item.description}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-muted-foreground/70 tabular-nums">
            {formatRelativeTime(item.timestamp)}
          </span>
          {item.actorName && (
            <>
              <span className="text-[10px] text-muted-foreground/40">
                &middot;
              </span>
              <span className="text-[10px] text-muted-foreground/70 font-medium">
                {item.actorName}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Navigation indicator */}
      {navigable && (
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 mt-1.5 group-hover:text-muted-foreground/60 transition-colors" />
      )}
    </button>
  );
}

// ─── Main Widget ───────────────────────────────────────────────

export default function ActivityFeedWidget({
  maxItems = 15,
  className,
}: ActivityFeedWidgetProps) {
  const { setCurrentPage } = useAppStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<{
    items: ActivityFeedItem[];
  }>({
    queryKey: ["activity-feed-widget", maxItems],
    queryFn: () =>
      apiFetch<{ items: ActivityFeedItem[] }>(
        `/api/activity-feed?maxItems=${maxItems}`
      ),
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  function handleItemClick(item: ActivityFeedItem) {
    const target = getNavigationTarget(item);
    if (target) {
      setCurrentPage(target.page, target.section);
    }
  }

  return (
    <Card
      className={cn(
        "animate-card-enter shadow-sm hover:shadow-md transition-shadow duration-200",
        className
      )}
    >
      {/* ── Header ── */}
      <CardHeader className="px-4 py-3 gap-0 border-b border-border/50">
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-500" />
              <CardTitle className="text-sm font-semibold">
                Recent Activity
              </CardTitle>
              <span className="live-dot ml-0.5" />
            </div>
          </button>

          <div className="flex items-center gap-1">
            {/* Refresh button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  isFetching && "animate-spin"
                )}
              />
            </Button>

            {/* View All link */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={() => setCurrentPage("Audit Log", "SETTINGS")}
            >
              View All
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* ── Body ── */}
      {!isCollapsed && (
        <CardContent className="px-3 py-2">
          {isLoading ? (
            <WidgetSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <div className="p-2 rounded-xl bg-red-100 dark:bg-red-950/30 text-red-500">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <p className="text-xs text-muted-foreground">
                Failed to load activity feed.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar divide-y divide-border/30">
              {items.map((item, index) => (
                <FeedItem
                  key={item.id}
                  item={item}
                  index={index}
                  onClick={() => handleItemClick(item)}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
