"use client";

import React, { useSyncExternalStore } from "react";
import { CircleDot, LogOut } from "lucide-react";

import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { useModuleStore } from "@/store/module-store";
import { isPageEnabled } from "@/lib/modules/registry";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { NavGroup } from "@/types";
import { navGroups } from "@/lib/nav-config";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Stable no-op subscribe for useSyncExternalStore ─────────
const emptySubscribe = () => () => {};

// ─── Mobile Sidebar Component ─────────────────────────────────

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  const { currentPage, setCurrentPage, openComplaintCount, unreadNotificationCount, user } =
    useAppStore();
  const logout = useAuthStore((s) => s.logout);
  const enabledModules = useModuleStore((s) => s.enabledModules);

  // Avoid hydration mismatch for Radix
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Filter navigation items based on enabled modules (same logic as desktop sidebar)
  const filteredNavGroups: NavGroup[] = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        isPageEnabled(item.label, enabledModules),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const handleNavClick = (itemLabel: string, groupId: string) => {
    setCurrentPage(itemLabel, groupId);
    onOpenChange(false);
  };

  if (!mounted) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col">
        <SheetHeader className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, #DC2626 0%, #B91C1B 100%)",
              }}
            >
              <CircleDot className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-gradient-red font-black text-base tracking-[0.15em] leading-none">
                CRYPTSK
              </span>
              <span className="text-[#64748B] text-[9px] font-semibold tracking-[0.2em] mt-0.5 leading-none uppercase">
                AAA Platform
              </span>
            </div>
          </div>
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate to different sections of the ISP management platform
          </SheetDescription>
        </SheetHeader>

        <div className="h-px mx-2 bg-sidebar-border" />

        <ScrollArea className="flex-1 h-[calc(100vh-120px)]">
          <div className="flex flex-col gap-1 px-2 py-2 pb-[env(safe-area-inset-bottom)]">
            {filteredNavGroups.map((group, groupIdx) => (
              <div key={group.id}>
                {/* Section divider between groups (not before the first) */}
                {groupIdx > 0 && (
                  <div className="sidebar-section-divider my-1" />
                )}

                {/* Group Label */}
                <div className="px-3 py-1.5 text-[0.6875rem] font-bold tracking-[0.08em] uppercase text-muted-foreground hover:text-foreground/80">
                  {group.label}
                </div>

                {/* Nav Items */}
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const isActive = item.label === currentPage;
                    const Icon = item.icon;

                    // Compute badge count dynamically
                    let badgeCount = item.badge;
                    if (item.label === "Complaints") {
                      badgeCount = openComplaintCount;
                    }
                    if (item.label === "Notifications") {
                      badgeCount = unreadNotificationCount;
                    }

                    return (
                      <button
                        key={item.label}
                        onClick={() => handleNavClick(item.label, group.id)}
                        className={cn(
                          "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                          "hover:bg-sidebar-accent/80 active:scale-[0.98]",
                          isActive
                            ? "bg-red-500/10 text-red-400 font-semibold border-l-[3px] border-l-red-500"
                            : "text-sidebar-foreground hover:text-sidebar-accent-foreground border-l-[3px] border-l-transparent",
                        )}
                      >
                        <Icon
                          className={cn(
                            "shrink-0 w-4 h-4 transition-colors",
                            isActive
                              ? "text-red-400"
                              : "text-muted-foreground group-hover:text-sidebar-accent-foreground",
                          )}
                        />
                        <span className="truncate flex-1 text-left">
                          {item.label}
                        </span>
                        {badgeCount !== undefined && badgeCount > 0 && (
                          <Badge
                            variant={
                              item.badgeVariant === "destructive"
                                ? "destructive"
                                : "secondary"
                            }
                            className={cn(
                              "h-5 min-w-[20px] min-h-[20px] px-1.5 text-[10px] font-bold rounded-full border-0 shrink-0",
                              "shadow-[0_0_8px_rgba(220,38,38,0.3)]",
                              item.badgeVariant === "destructive" &&
                                "bg-primary text-primary-foreground animate-badge-pulse",
                            )}
                          >
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer — matches desktop sidebar */}
        <div className="mt-auto px-2 pb-2 pt-1">
          <div className="h-px mb-2 mx-2 bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
          <div className="flex items-center gap-2 px-2 mb-1">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-emerald-400 font-medium">Online</span>
          </div>
          <div className="h-px mb-2 mx-2 bg-[#1E293B]" />
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar className="h-8 w-8 shrink-0 border border-[#1E293B]">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {user.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-white text-sm font-medium truncate leading-tight">
                {user.name}
              </span>
              <span className="text-[#64748B] text-[11px] truncate leading-tight">
                {user.role}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#64748B] hover:text-[#DC2626] hover:bg-[#1E293B] shrink-0"
              onClick={() => {
                logout();
                toast.success("Logged out successfully");
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-center pt-1 pb-1">
            <span className="text-[10px] text-[#475569] tracking-wide">
              Powered by <span className="text-primary font-semibold">Cryptsk</span> <span className="text-muted-foreground/40">v7.0</span>
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
