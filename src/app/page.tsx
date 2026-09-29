"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { UsersPanel } from "@/components/admin/users-panel";
import { AuditPanel } from "@/components/admin/audit-panel";
import { RolesPanel } from "@/components/admin/roles-panel";
import { CustomersPanel } from "@/components/admin/customers-panel";
import { ProductsPanel } from "@/components/admin/products-panel";
import { NasPanel } from "@/components/admin/nas-panel";
import { RadiusAcctPanel } from "@/components/admin/radius-acct-panel";
import { RadiusPostAuthPanel } from "@/components/admin/radius-postauth-panel";
import { SessionsPanel } from "@/components/admin/sessions-panel";
import { PoliciesPanel } from "@/components/admin/policies-panel";
import { VppPanel } from "@/components/admin/vpp-panel";
import { BillingPanel } from "@/components/admin/billing-panel";
import { NetworkPanel } from "@/components/admin/network-panel";
import { OperationsPanel } from "@/components/admin/operations-panel";
import { AiPanel } from "@/components/admin/ai-panel";
import { AdminPanel } from "@/components/admin/admin-panel";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

// ============================================================
// CRYPTSK Nexus — View Router (?view= registry)
// Dashboard default; panels in src/components/admin/*.
// ============================================================

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");

  // View switcher — renders admin panels based on ?view= param
  if (view === "users") return <UsersPanel />;
  if (view === "audit") return <AuditPanel />;
  if (view === "roles") return <RolesPanel />;
  if (view === "customers") return <CustomersPanel />;
  if (view === "products") return <ProductsPanel />;
  if (view === "nas") return <NasPanel />;
  if (view === "radius-acct") return <RadiusAcctPanel />;
  if (view === "radius-postauth") return <RadiusPostAuthPanel />;
  if (view === "sessions") return <SessionsPanel />;
  if (view === "policies") return <PoliciesPanel />;
  if (view === "vpp") return <VppPanel />;
  if (view === "billing") return <BillingPanel />;
  if (view === "network") return <NetworkPanel />;
  if (view === "operations") return <OperationsPanel />;
  if (view === "ai") return <AiPanel />;
  if (view === "admin") return <AdminPanel />;

  // Default: real-data dashboard
  return <DashboardHome />;
}
