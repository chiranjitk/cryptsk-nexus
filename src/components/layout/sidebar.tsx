"use client";

import React, { useState, useSyncExternalStore } from "react";

// ─── Stable no-op subscribe for useSyncExternalStore ─────────
const emptySubscribe = () => () => {};
import {
  ChevronDown,
  LogOut,
  CircleDot,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  SidebarShortcutBadge,
  SIDEBAR_SHORTCUT_MAP,
} from "@/components/keyboard-shortcuts-help";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NavGroup, NavItem } from "@/types";
import { useModuleStore } from "@/store/module-store";
import { isPageEnabled } from "@/lib/modules/registry";
import { navGroups } from "@/lib/nav-config";

// ─── Enterprise-grade Sidebar ──────────────────────────────────
// Design principles:
//  • Navigation is the hero — nothing competes with it
//  • Subtle, refined active state (soft tint + thin accent, no heavy borders)
//  • Tight, consistent density with breathing room
//  • Quiet, compact footer (user only — no redundant indicators)
//  • No decorative widgets inside the nav scroll

export function AppSidebar() {
  const { currentPage, setCurrentPage, openComplaintCount, unreadNotificationCount, user } =
    useAppStore();
  const logout = useAuthStore((s) => s.logout);
  const enabledModules = useModuleStore((s) => s.enabledModules);

  const filteredNavGroups: NavGroup[] = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        isPageEnabled(item.label, enabledModules)
      ),
    }))
    .filter((group) => group.items.length > 0);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const defaults = new Set<string>();
    filteredNavGroups.forEach((g) => {
      if (!g.defaultOpen) defaults.add(g.id);
    });
    return defaults;
  });

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleNavClick = (item: NavItem, section: string) => {
    setCurrentPage(item.label, section);
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  return (
    <Sidebar
      collapsible="icon"
      className="border-none shadow-[1px_0_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[1px_0_8px_-2px_rgba(0,0,0,0.25)]"
    >
      {/* ─── Brand Header ─────────────────────────────────── */}
      <SidebarHeader className="px-4 h-14 flex items-center">
        <div className="flex items-center gap-2.5 w-full">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)" }}
          >
            <CircleDot className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-[15px] font-bold tracking-[0.12em] leading-none text-sidebar-accent-foreground">
              CRYPTSK
            </span>
            <span className="text-[#64748B] text-[8px] font-medium tracking-[0.22em] mt-1 leading-none uppercase">
              ISP Platform
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator className="bg-[#1E293B]/60" />

      {/* ─── Navigation ───────────────────────────────────── */}
      {mounted ? (
        <SidebarContent className="px-2 py-2 pb-[env(safe-area-inset-bottom)]">
          <ScrollArea className="h-full">
            <nav className="flex flex-col gap-0.5 pb-4">
              {filteredNavGroups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.id);
                const isGroupActive = group.items.some(
                  (item) => item.label === currentPage
                );

                return (
                  <SidebarGroup key={group.id} className="px-0 gap-0">
                    <Collapsible
                      open={!isCollapsed}
                      onOpenChange={() => toggleGroup(group.id)}
                      className="w-full"
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          className={cn(
                            "group/label flex w-full items-center gap-1 px-2.5 py-1.5 mt-2 first:mt-0",
                            "text-[10px] font-semibold tracking-[0.12em] uppercase rounded-md",
                            "transition-colors duration-150",
                            "group-data-[collapsible=icon]:hidden",
                            isGroupActive
                              ? "text-sidebar-accent-foreground/80"
                              : "text-[#64748B] hover:text-[#94A3B8]"
                          )}
                        >
                          <SidebarGroupLabel
                            asChild
                            className="!h-auto !p-0 !ring-0 !text-inherit !opacity-100 !-mt-0 shrink-0"
                          >
                            <span>{group.label}</span>
                          </SidebarGroupLabel>
                          <ChevronDown
                            className={cn(
                              "ml-auto h-3 w-3 shrink-0 text-[#475569] transition-transform duration-200",
                              isCollapsed ? "rotate-[-90deg]" : "rotate-0"
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent data-radix-collapsible-content="">
                        <SidebarGroupContent>
                          <SidebarMenu className="gap-0.5">
                            {group.items.map((item) => {
                              const isActive = item.label === currentPage;
                              const Icon = item.icon;

                              let badgeCount = item.badge;
                              if (item.label === "Complaints") {
                                badgeCount = openComplaintCount;
                              }
                              if (item.label === "Notifications") {
                                badgeCount = unreadNotificationCount;
                              }

                              const shortcutKeys = SIDEBAR_SHORTCUT_MAP[item.label];

                              return (
                                <SidebarMenuItem key={item.label}>
                                  <SidebarMenuButton
                                    asChild
                                    isActive={isActive}
                                    tooltip={item.label}
                                    onClick={() => handleNavClick(item, group.id)}
                                    data-active={isActive ? "true" : undefined}
                                    className={cn(
                                      "group/nav cryptsk-nav-item h-8 rounded-md text-[13px]",
                                      isActive
                                        ? "cryptsk-nav-active bg-primary/12 text-primary-foreground font-medium"
                                        : "text-[#94A3B8] hover:bg-[#1E293B]/60 hover:text-sidebar-accent-foreground"
                                    )}
                                  >
                                    <button className="flex items-center gap-2.5 w-full px-2.5">
                                      <Icon
                                        className={cn(
                                          "shrink-0 w-[15px] h-[15px] transition-colors duration-150",
                                          isActive
                                            ? "text-primary"
                                            : "text-[#64748B] group-hover:text-[#94A3B8]"
                                        )}
                                      />
                                      <span className="truncate">
                                        {item.label}
                                      </span>
                                      {shortcutKeys && <SidebarShortcutBadge keys={shortcutKeys} />}
                                    </button>
                                  </SidebarMenuButton>

                                  {badgeCount !== undefined && badgeCount > 0 && (
                                    <SidebarMenuBadge className="text-inherit">
                                      <Badge
                                        variant={
                                          item.badgeVariant === "destructive"
                                            ? "destructive"
                                            : "secondary"
                                        }
                                        className={cn(
                                          "h-4 min-w-[16px] px-1 text-[9px] font-semibold rounded-full border-0 tabular-nums",
                                          item.badgeVariant === "destructive"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-primary/15 text-primary ring-1 ring-inset ring-primary/20"
                                        )}
                                      >
                                        {badgeCount > 99 ? "99+" : badgeCount}
                                      </Badge>
                                    </SidebarMenuBadge>
                                  )}
                                </SidebarMenuItem>
                              );
                            })}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarGroup>
                );
              })}
            </nav>
          </ScrollArea>
        </SidebarContent>
      ) : (
        <SidebarContent className="px-2 py-2">
          <div className="space-y-4 py-2">
            {filteredNavGroups.map((group) => (
              <div key={group.id}>
                <div className="h-3 w-16 bg-muted/40 rounded animate-pulse mb-2 px-2" />
                {group.items.slice(0, 3).map((item) => (
                  <div key={item.label} className="h-7 bg-muted/25 rounded-md mb-0.5 mx-0.5" />
                ))}
              </div>
            ))}
          </div>
        </SidebarContent>
      )}

      {/* ─── Footer (compact, quiet) ─────────────────────── */}
      <SidebarFooter className="px-2 pb-2 pt-1">
        <div className="h-px mb-1.5 mx-1 bg-[#1E293B]/60" />
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 group-data-[collapsible=icon]:justify-center hover:bg-[#1E293B]/50 transition-colors">
          <Avatar className="h-7 w-7 shrink-0 border border-[#1E293B]">
            <AvatarFallback
              className="text-[10px] font-semibold"
              style={{ background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)", color: "#fff" }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="text-sidebar-accent-foreground text-[12px] font-medium truncate leading-tight">
              {user.name}
            </span>
            <span className="text-[#64748B] text-[10px] truncate leading-tight mt-0.5">
              {user.role?.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[#64748B] hover:text-primary hover:bg-transparent shrink-0 group-data-[collapsible=icon]:hidden"
            onClick={() => {
              logout();
              toast.success("Logged out successfully");
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
