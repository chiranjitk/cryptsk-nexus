"use client";

import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard, Users, Building2, Shield, CreditCard, KeyRound,
  Network, Lock, Wrench, Activity, BarChart3, Handshake, Brain, Settings,
  ChevronDown,
} from "lucide-react";

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

type NavItem = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { title: string; href?: string }[];
  badge?: string;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Core", items: [{ title: "Dashboard", icon: LayoutDashboard, children: [{ title: "Overview" }, { title: "Live Sessions" }, { title: "System Health" }] }] },
  { label: "Customer Plane", items: [
    { title: "Customers & Services", icon: Users, children: [{ title: "Customers / Subscribers" }, { title: "Customer 360°" }, { title: "Products & Packages" }, { title: "Provisioning" }] },
    { title: "Organization & Scope", icon: Building2, badge: "LIC", children: [{ title: "Tenants" }, { title: "Organizations" }, { title: "Branches / Sites" }, { title: "Scope Manager" }] },
  ] },
  { label: "Policy & Access", items: [
    { title: "Policy Engine", icon: Shield, children: [{ title: "Surfing Quota" }, { title: "Access Time" }, { title: "Bandwidth" }, { title: "Data Transfer" }, { title: "FUP" }, { title: "App & Content" }, { title: "Security Profiles" }, { title: "Access / Auth" }, { title: "Simulator" }, { title: "Audit" }] },
    { title: "Access & AAA", icon: KeyRound, children: [{ title: "NAS Devices" }, { title: "RADIUS Users" }, { title: "RADIUS Groups" }, { title: "Authentication" }, { title: "Accounting" }, { title: "CoA / Disconnect" }, { title: "Auth Logs" }] },
  ] },
  { label: "Network & Security", items: [
    { title: "Network & Gateway", icon: Network, children: [{ title: "Gateways" }, { title: "Interfaces" }, { title: "VLAN / VRF" }, { title: "IPAM" }, { title: "Routing" }, { title: "Multi-WAN" }, { title: "DHCP" }, { title: "DNS" }, { title: "PPPoE" }, { title: "Captive Portal" }] },
    { title: "Security & Advanced", icon: Lock, children: [{ title: "Firewall" }, { title: "IPS / IDS" }, { title: "DDoS" }, { title: "VPN" }, { title: "DPI" }, { title: "Content / DNS Filter" }, { title: "TR-069 ACS" }, { title: "SNMP" }, { title: "MikroTik" }, { title: "SSH Terminal" }] },
  ] },
  { label: "Business Operations", items: [
    { title: "Billing & Finance", icon: CreditCard, children: [{ title: "Invoices" }, { title: "Payments" }, { title: "Collections" }, { title: "Plans & Pricing" }, { title: "Vouchers / Top-up" }, { title: "Add-on Charges" }, { title: "GST / Tax" }, { title: "TDS / TCS" }, { title: "Refunds" }, { title: "Reconciliation" }, { title: "Reports" }, { title: "Prepaid Wallet" }, { title: "Credit Notes" }, { title: "Write-off" }, { title: "Bad Debt" }, { title: "AR Aging" }, { title: "Dunning" }] },
    { title: "Operations & Support", icon: Wrench, children: [{ title: "Complaints" }, { title: "Tickets" }, { title: "Incidents" }, { title: "Installations" }, { title: "Inventory" }, { title: "Technicians" }, { title: "Field Ops" }, { title: "Resellers" }, { title: "Speed Test" }] },
  ] },
  { label: "Insights & Admin", items: [
    { title: "Monitoring & Diagnostics", icon: Activity, children: [{ title: "Live Monitor" }, { title: "Session Monitor" }, { title: "Traffic Analytics" }, { title: "NAT Logs" }, { title: "Syslog" }, { title: "SNMP Polling" }, { title: "Web Browsing Logs" }, { title: "Alerts" }, { title: "Grafana" }, { title: "Traceroute" }, { title: "Ping" }, { title: "Bandwidth Test" }, { title: "RADIUS Test" }] },
    { title: "Reports & Analytics", icon: BarChart3, children: [{ title: "Revenue" }, { title: "Subscriber Growth" }, { title: "Usage" }, { title: "Churn" }, { title: "ARPU" }] },
    { title: "Sales, Partners & Engagement", icon: Handshake, children: [{ title: "Leads" }, { title: "Campaigns" }, { title: "LCO / Partners" }, { title: "Commissions" }, { title: "WhatsApp" }, { title: "SMS" }, { title: "Email" }, { title: "Notifications" }] },
    { title: "AI & Intelligence", icon: Brain, children: [{ title: "AI Advisor" }, { title: "AI Diagnosis" }, { title: "Churn Prediction" }, { title: "Revenue Forecast" }, { title: "Plan Recommendations" }, { title: "Competitor Intel" }] },
    { title: "Administration", icon: Settings, children: [{ title: "Users", href: "/?view=users" }, { title: "Roles & Permissions", href: "/?view=roles" }, { title: "Modules" }, { title: "Feature Flags" }, { title: "API Keys" }, { title: "System Settings" }, { title: "Audit Log", href: "/?view=audit" }] },
  ] },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
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
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <Collapsible key={item.title} defaultOpen={false} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={item.title}>
                          {item.icon && <item.icon className="size-4" />}
                          <span>{item.title}</span>
                          {item.badge && (
                            <span className="ml-auto rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">{item.badge}</span>
                          )}
                          <ChevronDown className="ml-auto size-3 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      {item.children && (
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.title}>
                                <SidebarMenuSubButton asChild>
                                  <Link href={child.href || "/"}><span>{child.title}</span></Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </SidebarMenuItem>
                  </Collapsible>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" className="text-sidebar-foreground/60">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500 cryptsk-pulse-dot" />
                <span className="text-[10px]">v1.0.0-dev</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
