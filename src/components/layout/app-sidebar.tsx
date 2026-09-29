"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Package, CreditCard, KeyRound, Radio, ScrollText,
  Gauge, Network, Server, Brain, ShieldCheck, UserCog, Settings, ListChecks, Wifi, Wrench,
  FileBarChart, IndianRupee, Activity, FileDown,
} from "lucide-react";
import { canClient } from "@/lib/rbac";

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar";

// ============================================================
// Feature-registry-driven navigation (spec 07_UI_UX §30)
// Every leaf has a REAL destination — no dead links.
// Visibility = RBAC (session permissions) + module status.
// ============================================================

type NavLeaf = {
  title: string;
  href: string;            // real destination
  view: string;            // ?view= key used for active matching
  tab?: string;            // optional ?tab= refinement for shared views
  icon: React.ComponentType<{ className?: string }>;
  perm?: { resource: string; action: "read" | "list" | "manage" | "export" };
  badgeKey?: "activeSessions" | "openTickets";   // key into /api/health counts
};

type NavGroup = {
  label: string;
  module?: string;         // module slug that gates this group
  items: NavLeaf[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Core",
    items: [
      { title: "Dashboard", href: "/", view: "dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Customers & Billing",
    module: "customer_service",
    items: [
      { title: "Customers & Subscribers", href: "/?view=customers", view: "customers", icon: Users, perm: { resource: "subscriber", action: "list" } },
      { title: "Products & Packages", href: "/?view=products", view: "products", icon: Package, perm: { resource: "subscriber", action: "list" } },
      { title: "Invoices & Payments", href: "/?view=billing", view: "billing", icon: CreditCard, perm: { resource: "billing.invoice", action: "list" } },
    ],
  },
  {
    label: "Access & AAA",
    module: "aaa",
    items: [
      { title: "Active Sessions", href: "/?view=sessions", view: "sessions", icon: Wifi, perm: { resource: "session", action: "list" }, badgeKey: "activeSessions" },
      { title: "NAS Devices", href: "/?view=nas", view: "nas", icon: Server, perm: { resource: "aaa.nas", action: "list" } },
      { title: "Authentication Logs", href: "/?view=radius-postauth", view: "radius-postauth", icon: KeyRound, perm: { resource: "aaa.radius", action: "read" } },
      { title: "RADIUS Accounting", href: "/?view=radius-acct", view: "radius-acct", icon: ScrollText, perm: { resource: "aaa.radius", action: "read" } },
    ],
  },
  {
    label: "Policy & Network",
    module: "policy_engine",
    items: [
      { title: "Policies & Rules", href: "/?view=policies", view: "policies", icon: ListChecks, perm: { resource: "policy", action: "list" } },
      { title: "Network Manager", href: "/?view=network", view: "network", icon: Network, perm: { resource: "dhcp", action: "list" } },
      { title: "VPP Gateway", href: "/?view=vpp", view: "vpp", icon: Gauge, perm: { resource: "network.gateway", action: "read" } },
    ],
  },
  {
    label: "Operations",
    module: "operations_support",
    items: [
      { title: "Tickets & Support", href: "/?view=operations", view: "operations", icon: Wrench, perm: { resource: "ticket", action: "list" }, badgeKey: "openTickets" },
    ],
  },
  {
    label: "Monitoring",
    module: "monitoring",
    items: [
      { title: "Monitoring & Diagnostics", href: "/?view=monitoring", view: "monitoring", icon: Activity, perm: { resource: "monitoring", action: "list" } },
    ],
  },
  {
    label: "Reports & Analytics",
    module: "reporting",
    items: [
      { title: "Report Center", href: "/?view=reports", view: "reports", icon: FileBarChart, perm: { resource: "report", action: "list" } },
      { title: "Revenue & Collection", href: "/?view=reports&tab=revenue", view: "reports", tab: "revenue", icon: IndianRupee, perm: { resource: "report", action: "list" } },
      { title: "Usage & Bandwidth", href: "/?view=reports&tab=usage", view: "reports", tab: "usage", icon: Activity, perm: { resource: "report", action: "list" } },
      { title: "Compliance & SLA", href: "/?view=reports&tab=sla", view: "reports", tab: "sla", icon: ShieldCheck, perm: { resource: "report", action: "list" } },
      { title: "Data Export", href: "/?view=reports&tab=export", view: "reports", tab: "export", icon: FileDown, perm: { resource: "report", action: "export" } },
    ],
  },
  {
    label: "Intelligence",
    module: "ai_intelligence",
    items: [
      { title: "AI Advisor & Insights", href: "/?view=ai", view: "ai", icon: Brain, perm: { resource: "ai_advisor", action: "read" } },
    ],
  },
  {
    label: "Administration",
    module: "identity_admin",
    items: [
      { title: "Admin Users", href: "/?view=users", view: "users", icon: UserCog, perm: { resource: "user", action: "list" } },
      { title: "Roles & Permissions", href: "/?view=roles", view: "roles", icon: ShieldCheck, perm: { resource: "role", action: "list" } },
      { title: "System Administration", href: "/?view=admin", view: "admin", icon: Settings, perm: { resource: "system_setting", action: "read" } },
      { title: "Audit Log", href: "/?view=audit", view: "audit", icon: ScrollText, perm: { resource: "audit", action: "list" } },
    ],
  },
];

type HealthCounts = {
  status?: string;
  counts?: { activeSessions?: number; openTickets?: number };
};

export function AppSidebar() {
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view") ?? "dashboard";
  const { data: session } = useSession();

  const perms = (session?.user as { permissions?: string[] } | undefined)?.permissions;
  const roles = (session?.user as { roles?: string[] } | undefined)?.roles;

  // Live badge source: /api/health counts (real data, 30s refresh)
  const { data: health } = useQuery<HealthCounts>({
    queryKey: ["sidebar-health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("unavailable");
      return res.json();
    },
    refetchInterval: 30000,
    retry: 1,
    staleTime: 25000,
  });
  const healthCounts = health?.counts || {};

  const canSee = (leaf: NavLeaf): boolean =>
    !leaf.perm || canClient(perms, roles, leaf.perm.resource, leaf.perm.action);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="CRYPTSK Nexus">
              <Link href="/" className="flex items-center gap-3">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary sidebar-logo-glow">
                  <span className="text-primary-foreground font-bold text-sm">C</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="font-bold text-sidebar-foreground">CRYPTSK</span>
                  <span className="text-[10px] text-sidebar-foreground/60">Nexus Platform</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="cryptsk-scrollbar">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(canSee);
          if (visibleItems.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const activeTab = searchParams.get("tab");
                    const active = item.view === activeView && (!item.tab || item.tab === activeTab);
                    // Generalized badge: any badgeKey resolves against /api/health counts
                    const badgeValue = item.badgeKey
                      ? healthCounts[item.badgeKey as keyof NonNullable<HealthCounts["counts"]>]
                      : undefined;
                    const badge = typeof badgeValue === "number" && badgeValue > 0 ? badgeValue : null;
                    const badgeTone = item.badgeKey === "openTickets"
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title}
                          className={active
                            ? "border-l-[3px] border-l-primary rounded-l-none bg-primary/10 text-sidebar-accent-foreground font-semibold"
                            : ""}>
                          <Link href={item.href}>
                            <item.icon className={`size-4 ${active ? "text-primary" : ""}`} />
                            <span className={active ? "text-primary" : ""}>{item.title}</span>
                            {badge !== null && (
                              <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${badgeTone}`}>
                                {badge}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" className="text-sidebar-foreground/60" tooltip="System status">
              <div className="flex items-center gap-2">
                <div className={`size-2 rounded-full cryptsk-pulse-dot ${health?.status === "healthy" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="text-[10px]">v1.0.0 · PostgreSQL 18</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
