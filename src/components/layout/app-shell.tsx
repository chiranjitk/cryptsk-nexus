"use client";

import { useSession } from "next-auth/react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { LoginCard } from "@/components/auth/login-card";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

// ============================================================
// CRYPTSK Nexus — AppShell
// Wraps the entire app shell (sidebar + header + footer + content)
// in an auth gate. If unauthenticated → shows ONLY login card
// (no sidebar, no header, no footer). If authenticated → shows
// the full dashboard shell.
// ============================================================

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

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
