"use client";

import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";

// ─── Stable no-op subscribe for useSyncExternalStore ─────────
const emptySubscribe = () => () => {};
import {
  Search,
  Settings,
  User,
  LogOut,
  Sun,
  Moon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Shield,
  Server,
  Cpu,
  Database,
  Volume2,
  VolumeX,
  Menu,
  Wifi,
  Radio,
} from "lucide-react";
import { MobileSidebar } from "./mobile-sidebar";
import { ExportManager } from "@/components/export-manager";
import { NotificationPanel } from "@/components/notification-panel";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { UserRole } from "@/types";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// ─── Notification Sound ──────────────────────────────────────────

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.1;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // AudioContext not available (SSR, restricted browser, etc.)
  }
}

const SOUND_PREF_KEY = "cryptsk-notification-sound";

function getSoundPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    return stored !== null ? stored === "true" : true;
  } catch {
    return true;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/** Role → badge colour mapping */
function roleBadgeStyle(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    case "ADMIN":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    case "OPERATOR":
      return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-teal-200 dark:border-teal-800";
    case "AGENT":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
    case "TECHNICIAN":
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200 dark:border-violet-800";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700";
  }
}

/** Role → display label */
function roleLabel(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN":
      return "Admin";
    case "OPERATOR":
      return "Operator";
    case "AGENT":
      return "Agent";
    case "TECHNICIAN":
      return "Technician";
    default:
      return role;
  }
}

// ─── Main Header Component ──────────────────────────────────────

export function AppHeader() {
  const {
    currentPage,
    currentSection,
    unreadNotificationCount,
    user,
    setCurrentPage,
  } = useAppStore();
  const logout = useAuthStore((s) => s.logout);
  const { resolvedTheme, setTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(getSoundPref);

  // Persist sound preference to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SOUND_PREF_KEY, String(soundEnabled));
    } catch {
      // ignore
    }
  }, [soundEnabled]);

  // ── Play notification sound when unread count increases ──
  const prevUnreadRef = useRef(unreadNotificationCount);
  useEffect(() => {
    if (
      soundEnabled &&
      unreadNotificationCount > prevUnreadRef.current &&
      prevUnreadRef.current >= 0
    ) {
      playNotificationSound();
    }
    prevUnreadRef.current = unreadNotificationCount;
  }, [soundEnabled, unreadNotificationCount]);

  // ── Client-only mounted detection (avoids hydration mismatch) ──
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    function handleThemeShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const current = resolvedTheme || "light";
        setTheme(current === "dark" ? "light" : "dark");
      }
    }
    document.addEventListener("keydown", handleThemeShortcut);
    return () => document.removeEventListener("keydown", handleThemeShortcut);
  }, [resolvedTheme, setTheme]);

  // ── Real-time clock (Indian locale, updates every minute) ──
  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        }),
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch system health ──
  const { data: healthData } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => fetch("/api/system/health").then((r) => r.json()),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  // ── Fetch online subscriber count ──
  const { data: onlineData } = useQuery({
    queryKey: ["header-online-count"],
    queryFn: () => fetch("/api/subscribers/online-count").then((r) => r.json()),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // ── Fetch RADIUS sync status ──
  const { data: radiusData } = useQuery({
    queryKey: ["header-radius-sync"],
    queryFn: () => fetch("/api/freeradius/sync-status").then((r) => r.json()),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  // ── Handlers ──
  const handleSearchTrigger = useCallback(() => {
    useAppStore.getState().setCommandPaletteOpen(true);
    // Close the mobile search bar after triggering palette
    setSearchOpen(false);
  }, []);

  const toggleTheme = useCallback(() => {
    const current = resolvedTheme || "light";
    setTheme(current === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return (
    <>
    <div className="scroll-progress fixed top-0 left-0 right-0 z-[60] h-[3px]" />
    <header className="sticky top-0 z-30 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        {/* ── Left: Hamburger (mobile) / Sidebar Toggle (desktop) + Breadcrumb ── */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile hamburger menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden text-muted-foreground hover:text-foreground transition-all duration-200 btn-ripple"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Desktop sidebar toggle (hidden on mobile) */}
          <SidebarTrigger className="-ml-1 hover:text-primary hidden lg:flex" />

          <Separator
            orientation="vertical"
            className="h-5 bg-border hidden sm:block"
          />

          <Breadcrumb className="hidden sm:flex">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  href="#"
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  {currentSection}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-foreground text-sm font-medium">
                  {currentPage}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Mobile page title */}
          <span className="text-sm font-medium text-foreground sm:hidden truncate">
            {currentPage}
          </span>
        </div>

        {/* ── Right: Clock + Search + Theme + Notifications + Avatar ── */}
        <div className="flex items-center gap-2">
          {/* Real-time Clock (hidden on mobile) */}
          {mounted && currentTime && (
            <div className="hidden lg:flex items-center gap-1.5 text-muted-foreground mr-1">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs font-medium tabular-nums">
                {currentTime}
              </span>
            </div>
          )}

          {/* ── System Health Indicator ── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "relative h-9 w-9 text-muted-foreground hover:text-foreground transition-all duration-200",
                  healthData?.status === "critical" && "text-red-500 hover:text-red-600"
                )}
              >
                <Server className="h-4 w-4" />
                {healthData?.status === "healthy" && (
                  <span className="absolute bottom-1.5 right-1.5 flex h-1.5 w-1.5">
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#16A34A]" />
                  </span>
                )}
                {healthData?.status === "degraded" && (
                  <span className="absolute bottom-1.5 right-1.5 flex h-1.5 w-1.5">
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#D97706]" />
                  </span>
                )}
                {healthData?.status === "critical" && (
                  <span className="absolute bottom-1.5 right-1.5 flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-0">
              <div className="px-3 py-2.5 border-b">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    System Health
                  </span>
                  {healthData?.status && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0 h-5 font-medium",
                        healthData.status === "healthy" && "bg-green-50 text-green-700 border-green-200",
                        healthData.status === "degraded" && "bg-amber-50 text-amber-700 border-amber-200",
                        healthData.status === "critical" && "bg-red-50 text-red-700 border-red-200"
                      )}
                    >
                      {healthData.status === "healthy" ? "Healthy" : healthData.status === "degraded" ? "Degraded" : "Critical"}
                    </Badge>
                  )}
                </div>
                {healthData?.server && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{healthData.server}</p>
                )}
              </div>
              <div className="p-3 space-y-2.5">
                {/* Uptime */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Uptime</span>
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    {healthData?.uptimeHuman || "—"}
                  </span>
                </div>
                {/* Memory */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Cpu className="h-3.5 w-3.5" />
                      <span>Memory</span>
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {healthData?.memory?.used || "—"} / {healthData?.memory?.total || "—"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        (healthData?.memory?.percentage || 0) > 80
                          ? "bg-red-500"
                          : (healthData?.memory?.percentage || 0) > 60
                            ? "bg-amber-500"
                            : "bg-green-500"
                      )}
                      style={{ width: `${Math.min(healthData?.memory?.percentage || 0, 100)}%` }}
                    />
                  </div>
                </div>
                {/* Database */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Database className="h-3.5 w-3.5" />
                    <span>Database</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {healthData?.database?.status === "connected" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span className="text-xs font-medium text-foreground capitalize">
                      {healthData?.database?.status || "—"}
                    </span>
                  </div>
                </div>
                {/* Version */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Version</span>
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    v{healthData?.version || "6.1"}
                  </span>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ── Online Subscribers (compact) ── */}
          <div className="hidden md:flex items-center gap-1 text-emerald-600 dark:text-emerald-400 mr-1">
            <Wifi className="h-3.5 w-3.5" />
            <span className="text-[11px] font-bold tabular-nums">{onlineData?.onlineCount ?? "—"}</span>
          </div>

          {/* RADIUS indicator dot */}
          <div className={cn(
            "hidden sm:flex h-2 w-2 rounded-full mr-1",
            radiusData?.status === "synced" && "bg-emerald-500",
            radiusData?.status === "minor_drift" && "bg-amber-500",
            (!radiusData?.status || radiusData?.status === "drifted") && "bg-red-500"
          )} />

          {/* Search Input */}
          <div
            className={cn(
              "relative",
              searchOpen
                ? "w-64"
                : "hidden md:block md:w-64",
            )}
          >
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search anything..."
              readOnly
              onClick={handleSearchTrigger}
              onFocus={handleSearchTrigger}
              className="pl-8 pr-[4.5rem] h-9 bg-muted/50 border-border/50 text-sm placeholder:text-muted-foreground focus:bg-background focus:ring-1 focus:ring-primary/20 cursor-pointer transition-all duration-200"
            />
            {/* Keyboard shortcut hint inside the input */}
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted rounded border border-border/50 transition-all duration-200">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>

          {/* Mobile search toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 md:hidden text-muted-foreground hover:text-foreground transition-all duration-200"
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs font-medium">
              Search... ⌘K
            </TooltipContent>
          </Tooltip>

          {/* ── Export Manager ── */}
          <ExportManager />

          {/* ── Notification Sound Toggle ── */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-9 w-9 transition-all duration-200",
                  soundEnabled
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/40 hover:text-muted-foreground"
                )}
                onClick={() => setSoundEnabled((prev) => !prev)}
                aria-label={soundEnabled ? "Mute notification sounds" : "Enable notification sounds"}
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs font-medium">
              {soundEnabled ? "Sound On" : "Sound Off"}
            </TooltipContent>
          </Tooltip>

          {/* ── Notification Panel (Popover) ── */}
          <NotificationPanel />

          {/* ── Theme Toggle (Sun/Moon) ── */}
          <DarkModeToggle />

          {/* ── User Avatar Dropdown ── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-8 w-8 rounded-full ml-1"
              >
                <Avatar className="h-8 w-8 avatar-ring">
                  <AvatarFallback className="bg-primary text-white text-xs font-bold">
                    {user.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* User info + role badge */}
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-semibold text-foreground">
                    {user.name || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "w-fit text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0 h-5",
                      roleBadgeStyle(user.role),
                    )}
                  >
                    <Shield className="h-2.5 w-2.5 mr-1" />
                    {roleLabel(user.role)}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {/* View Profile → ISP Profile page */}
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => {
                    setCurrentPage("ISP Profile", "SETTINGS");
                  }}
                >
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>View Profile</span>
                </DropdownMenuItem>

                {/* Settings → Notifications page */}
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => {
                    setCurrentPage("Notifications", "SETTINGS");
                  }}
                >
                  <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Settings</span>
                </DropdownMenuItem>

                {/* Toggle Theme */}
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={toggleTheme}
                >
                  {mounted && resolvedTheme === "dark" ? (
                    <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
                  )}
                  <span>
                    {mounted && resolvedTheme === "dark"
                      ? "Light Mode"
                      : "Dark Mode"}
                  </span>
                  <kbd className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted rounded border border-border">
                    <span className="text-xs">⌘</span>
                    <span>⇧</span>
                    <span>D</span>
                  </kbd>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-primary focus:text-primary focus:bg-destructive/10 dark:focus:bg-destructive/5"
                onClick={() => {
                  logout();
                  toast.success("Logged out successfully");
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>

      {/* Mobile Sidebar Sheet Overlay */}
      <MobileSidebar
        open={mobileSidebarOpen}
        onOpenChange={setMobileSidebarOpen}
      />
    </>
  );
}
