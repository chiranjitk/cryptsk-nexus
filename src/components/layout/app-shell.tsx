"use client";

import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { LoginCard } from "@/components/auth/login-card";
import { SelfCarePortal } from "@/components/selfcare/selfcare-portal";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

// ============================================================
// CRYPTSK Nexus — AppShell
// Wraps the entire app shell (sidebar + header + footer + content)
// in an auth gate. If unauthenticated → shows ONLY login card
// (no sidebar, no header, no footer). If authenticated → shows
// the full dashboard shell — UNLESS ?view=selfcare, in which case
// the customer-facing Self-Care portal REPLACES the admin chrome
// entirely (own header + nav + footer; children never render).
// ============================================================

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const isSelfCare = searchParams.get("view") === "selfcare";

  // Loading state — full-screen spinner
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary sidebar-logo-glow">
            <span className="text-primary-foreground font-bold text-3xl">C</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="size-4 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
            Loading CRYPTSK Nexus…
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated → login only (no shell)
  if (!session) {
    return <LoginCard />;
  }

  // Authenticated + ?view=selfcare → customer portal replaces the
  // admin chrome entirely. Returning here (before SidebarProvider)
  // means <AppSidebar/>, <AppHeader/>, <AppFooter/> and {children}
  // never mount — the page's view router is bypassed too.
  // Customer sessions (portal login) are ALWAYS routed to the
  // self-care portal — spec §18: customers must never see internal
  // administration, even with an RBAC-empty sidebar.
  if (isSelfCare || (session.user as { userType?: string })?.userType === "customer") {
    return <SelfCarePortal />;
  }

  // Authenticated → full app shell
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex min-h-screen flex-col">
          <AppHeader />
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <AppFooter />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
