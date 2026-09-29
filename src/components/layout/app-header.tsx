"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Search, Bell, Sun, Moon, Mic, Command, LogOut, User, Settings, ChevronDown,
  Wifi, Activity, Database, Clock3, Server, Info, CheckCircle2, AlertTriangle,
  XCircle, Cpu, Inbox, CheckCheck, type LucideIcon,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CommandPalette, useCommandPalette } from "@/components/layout/command-palette";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ============================================================
// CRYPTSK Nexus — App Header
// Search (⌘K palette) · live clock · system health popover ·
// online sessions chip · notifications center · theme (⌘⇧D) ·
// user menu.
// ============================================================

// ---------- Types ----------

type HealthResponse = {
  status: "healthy" | "unhealthy";
  db: "connected" | "error";
  counts: {
    users: number;
    customers: number;
    subscribers: number;
    activeSessions: number;
    unreadNotifications: number;
    nas: { total: number; up: number };
  };
  serverTime: string;
  uptimeSec: number;
};

type NotificationType = "info" | "success" | "warning" | "error" | "system";

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

// ---------- Helpers ----------

function humanizeUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const NOTIF_TYPE_META: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "text-stone-500 dark:text-stone-400" },
  success: { icon: CheckCircle2, className: "text-emerald-500" },
  warning: { icon: AlertTriangle, className: "text-amber-500" },
  error: { icon: XCircle, className: "text-red-500" },
  system: { icon: Cpu, className: "text-violet-500" },
};

// ---------- Live clock (client-only — no hydration mismatch) ----------

function LiveClock() {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Placeholder keeps header height stable until mounted
    return <div className="hidden h-9 md:block" aria-hidden="true" />;
  }

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);

  return (
    <div className="hidden flex-col items-end leading-none md:flex" aria-label="Current time">
      <span className="font-mono text-xs font-semibold tabular-nums text-foreground/80">{time}</span>
      <span className="mt-0.5 text-[10px] text-muted-foreground">{date}</span>
    </div>
  );
}

// ---------- Main header ----------

export function AppHeader() {
  const { data: session } = useSession();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Command palette control
  const { setOpen: setPaletteOpen, open: paletteOpen } = useCommandPalette();
  // Guard: Radix restores focus to the search button on palette close,
  // which would re-fire onFocus and re-open — block for a short window.
  const lastClosedAt = React.useRef(0);
  React.useEffect(() => {
    if (!paletteOpen) lastClosedAt.current = Date.now();
  }, [paletteOpen]);
  const openPalette = React.useCallback(() => {
    if (Date.now() - lastClosedAt.current < 300) return;
    setPaletteOpen(true);
  }, [setPaletteOpen]);

  // ⌘⇧D toggles theme (global listener — ⌘K is owned by the palette)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTheme, resolvedTheme]);

  // ----- System health (30s poll) -----
  const healthQuery = useQuery<HealthResponse>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`Health check failed (${res.status})`);
      return res.json() as Promise<HealthResponse>;
    },
    refetchInterval: 30000,
    staleTime: 25000,
    retry: 1,
  });
  const health = healthQuery.data;
  const healthState: "healthy" | "loading" | "unhealthy" = healthQuery.isError
    ? "unhealthy"
    : health
      ? health.status === "healthy"
        ? "healthy"
        : "unhealthy"
      : "loading";
  const dotCls =
    healthState === "healthy"
      ? "bg-emerald-500"
      : healthState === "unhealthy"
        ? "bg-red-500"
        : "bg-amber-500";

  // ----- Notifications (graceful fallback while /api/notifications lands) -----
  const notifQuery = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationsResponse> => {
      try {
        const res = await fetch("/api/notifications?limit=10");
        if (!res.ok) return { notifications: [], unreadCount: 0 }; // 404 / error → zeros
        const data = await res.json();
        return {
          notifications: Array.isArray(data?.notifications) ? data.notifications : [],
          unreadCount: typeof data?.unreadCount === "number" ? data.unreadCount : 0,
        };
      } catch {
        return { notifications: [], unreadCount: 0 };
      }
    },
    refetchInterval: 60000,
  });
  const notifications = notifQuery.data?.notifications ?? [];
  const unreadCount = notifQuery.data?.unreadCount ?? 0;

  const [notifOpen, setNotifOpen] = React.useState(false);

  const invalidateNotifications = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  const handleNotificationClick = React.useCallback(
    async (n: NotificationItem) => {
      if (!n.readAt) {
        try {
          await fetch(`/api/notifications/${n.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ read: true }),
          });
        } catch {
          // silent — navigation still proceeds
        }
        invalidateNotifications();
      }
      setNotifOpen(false);
      if (n.link) router.push(n.link);
    },
    [invalidateNotifications, router]
  );

  const handleMarkAllRead = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) throw new Error(`Mark all read failed (${res.status})`);
      invalidateNotifications();
    } catch {
      toast({
        title: "Could not mark notifications read",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    }
  }, [invalidateNotifications, toast]);

  // ----- Session/user (unchanged behavior) -----
  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const roles = (session?.user as any)?.roles || [];

  // Dynamic breadcrumb from current ?view= (mirrors sidebar registry)
  const searchParams = useSearchParams();
  const breadcrumbLabels: Record<string, string> = {
    users: "Admin Users", roles: "Roles & Permissions", customers: "Customers & Subscribers",
    products: "Products & Packages", nas: "NAS Devices", "radius-acct": "RADIUS Accounting",
    "radius-postauth": "Authentication Logs", sessions: "Active Sessions", policies: "Policies & Rules",
    vpp: "VPP Gateway", billing: "Invoices & Payments", network: "Network Manager",
    ai: "AI Advisor & Insights", audit: "Audit Log", admin: "System Administration",
    operations: "Tickets & Support",
  };
  const reportTabLabels: Record<string, string> = {
    center: "Report Center", revenue: "Revenue & Collection", usage: "Usage & Bandwidth",
    sla: "Compliance & SLA", export: "Data Export",
  };
  const viewParam = searchParams.get("view");
  const tabParam = searchParams.get("tab");
  const crumb =
    viewParam === "reports"
      ? `Reports & Analytics${tabParam && reportTabLabels[tabParam] ? ` · ${reportTabLabels[tabParam]}` : ""}`
      : viewParam
        ? breadcrumbLabels[viewParam] ?? "Dashboard"
        : "Dashboard";

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="hidden sm:inline font-semibold text-foreground">CRYPTSK Nexus</span>
        <span className="hidden sm:inline text-muted-foreground/40">/</span>
        <span className="hidden sm:inline max-w-[16rem] truncate whitespace-nowrap md:max-w-[24rem]" title={crumb}>{crumb}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Search → opens the ⌘K command palette */}
        <button
          type="button"
          onClick={openPalette}
          onFocus={openPalette}
          aria-label="Search or jump to — opens command palette (Ctrl+K)"
          className="hidden h-9 w-40 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50 md:flex lg:w-64"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">Search or jump to…</span>
          <kbd className="hidden items-center gap-0.5 rounded border bg-muted px-1 text-[10px] text-muted-foreground lg:flex">
            <Command className="size-2.5" />K
          </kbd>
        </button>

        <Separator orientation="vertical" className="hidden md:block" />

        {/* Live clock */}
        <LiveClock />

        <Separator orientation="vertical" className="hidden md:block" />

        {/* System health indicator */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 relative"
              aria-label={`System health: ${healthState}`}
            >
              <Activity className="size-4" />
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background",
                  dotCls,
                  healthState === "healthy" && "cryptsk-pulse-dot"
                )}
                aria-hidden="true"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-4 cryptsk-scale-in">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">System Health</p>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] gap-1.5",
                  healthState === "healthy" && "text-emerald-600 dark:text-emerald-400",
                  healthState === "unhealthy" && "text-red-600 dark:text-red-400",
                  healthState === "loading" && "text-amber-600 dark:text-amber-400"
                )}
              >
                <span className={cn("size-1.5 rounded-full", dotCls)} aria-hidden="true" />
                {healthState === "healthy" ? "Operational" : healthState === "loading" ? "Checking…" : "Degraded"}
              </Badge>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Database className="size-3.5" /> Database
                </span>
                <span className={cn(
                  "font-medium",
                  health?.db === "connected" && "text-emerald-600 dark:text-emerald-400",
                  health && health.db !== "connected" && "text-red-600 dark:text-red-400",
                  !health && "text-muted-foreground"
                )}>
                  {health?.db === "connected" ? "Connected" : health ? "Error" : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock3 className="size-3.5" /> Uptime
                </span>
                <span className="font-mono tabular-nums">{health ? humanizeUptime(health.uptimeSec) : "—"}</span>
              </div>
              <div className="my-2 h-px bg-border" role="separator" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Users</span>
                  <span className="font-mono tabular-nums">{health?.counts.users ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Customers</span>
                  <span className="font-mono tabular-nums">{health?.counts.customers ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subscribers</span>
                  <span className="font-mono tabular-nums">{health?.counts.subscribers ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sessions</span>
                  <span className="font-mono tabular-nums">{health?.counts.activeSessions ?? "—"}</span>
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Server className="size-3.5" /> NAS devices
                  </span>
                  <span className="font-mono tabular-nums">
                    {health ? `${health.counts.nas.up}/${health.counts.nas.total} up` : "—"}
                  </span>
                </div>
              </div>
              <div className="my-2 h-px bg-border" role="separator" />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Server time</span>
                <span className="font-mono text-[10px] tabular-nums">
                  {health ? new Date(health.serverTime).toLocaleString() : "—"}
                </span>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Online sessions chip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400 lg:flex"
              aria-label={`${health?.counts.activeSessions ?? 0} active sessions online`}
            >
              <Wifi className="size-3" aria-hidden="true" />
              <span className="tabular-nums">{health ? health.counts.activeSessions : "—"} online</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {health
              ? `${health.counts.activeSessions} active RADIUS sessions`
              : "Loading session count…"}
          </TooltipContent>
        </Tooltip>

        {/* Voice Assistant */}
        <Button variant="ghost" size="icon" className="size-9" title="Voice Assistant" aria-label="Voice Assistant">
          <Mic className="size-4" />
        </Button>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" className="size-9" title="Toggle theme" aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Notifications center */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 relative"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <Badge className="badge-pulse absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center rounded-full px-1 p-0 text-[9px]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 cryptsk-scale-in sm:w-96">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-sm font-semibold">Notifications</p>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">{unreadCount} new</Badge>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto cryptsk-scrollbar" role="list" aria-label="Notification list">
              {notifQuery.isLoading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <div className="size-5 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
                  <span className="text-xs">Loading notifications…</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Inbox className="size-6 opacity-50" />
                  <span className="text-xs">You&apos;re all caught up</span>
                </div>
              ) : (
                notifications.map((n) => {
                  const meta = NOTIF_TYPE_META[n.type] ?? NOTIF_TYPE_META.info;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      role="listitem"
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        "flex w-full items-start gap-2.5 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/50",
                        !n.readAt && "bg-primary/[0.04]"
                      )}
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className={cn("size-3.5", meta.className)} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold">{n.title}</span>
                          {!n.readAt && (
                            <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {n.message}
                        </span>
                        <span className="mt-1 block text-[10px] text-muted-foreground/70">
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t px-2 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0 || notifQuery.isLoading}
              >
                <CheckCheck className="mr-1.5 size-3.5" />
                Mark all read
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* User menu with logout */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-accent">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col items-start leading-tight lg:flex">
                <span className="text-xs font-medium">{userName}</span>
                <span className="text-[10px] text-muted-foreground">
                  {roles[0] || "User"}
                </span>
              </div>
              <ChevronDown className="size-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 cryptsk-scale-in">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                {roles.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {roles.slice(0, 2).map((r: string) => (
                      <Badge key={r} variant="secondary" className="text-[9px] px-1 py-0">
                        {r}
                      </Badge>
                    ))}
                    {roles.length > 2 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        +{roles.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <User className="mr-2 size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-500/10"
              onClick={() => signOut({ redirect: false }).then(() => window.location.href = "/")}
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Global ⌘K command palette (mounted once, dialog portals to body) */}
      <CommandPalette />
    </header>
  );
}
