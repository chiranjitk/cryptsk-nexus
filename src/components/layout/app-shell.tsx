"use client";

import React, { useSyncExternalStore, useCallback, useEffect, useRef } from "react";

import { Providers } from "@/components/providers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/header";
import { AppFooter } from "@/components/layout/footer";
import { useBadgeCounts } from "@/hooks/use-badge-counts";
import { QuickNotesWidget } from "@/components/quick-notes-widget";
import { QuickActionsWidget } from "@/components/quick-actions-widget";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog";
import { NProgressLoader } from "@/components/nprogress-loader";
import VoiceAssistantButton from "@/components/voice-assistant/voice-assistant-button";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { useModuleStore } from "@/store/module-store";

interface AppShellProps {
  children: React.ReactNode;
}

const emptySubscribe = () => () => {};

// ─── Module Store Sync ──────────────────────────────────────────
// Fetches the persisted module config from the server on mount
// so that the Zustand store always reflects the real state
// (including any modules the user previously disabled).
function ModuleStoreSync() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch("/api/modules")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch modules");
        return res.json();
      })
      .then((data) => {
        if (data.enabledModules && Array.isArray(data.enabledModules)) {
          useModuleStore.getState().initialize(data.enabledModules, data.deploymentType);
        }
      })
      .catch((err) => {
        // Silently fail — store keeps defaults
        console.warn("[ModuleStoreSync] Could not sync from server:", err.message);
      });
  }, []);

  return null;
}

export function AppShell({ children }: AppShellProps) {
  // useSyncExternalStore avoids the setState-in-effect lint warning and is
  // the idiomatic React 18/19 way to force a client-only re-render.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const currentPage = useAppStore((s) => s.currentPage);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Fetch real badge counts (notifications + complaints) on mount + every 60s
  // Must always be called (Rules of Hooks), but badge fetches are lightweight
  useBadgeCounts();

  // Delay rendering until client-side mount to prevent Radix UI hydration
  // mismatch (auto-generated IDs differ between server and client)
  if (!mounted) {
    return null;
  }

  // Self-Care Portal has its own layout — render children without admin chrome
  if (currentPage === "SelfCare") {
    return <>{children}</>;
  }

  // Login page should not show admin sidebar/header/footer
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <Providers>
      <SidebarProvider>
        <NProgressLoader />
        <ModuleStoreSync />
        {/* Desktop sidebar — hidden on mobile, shown on lg+ screens */}
        <div className="hidden lg:block">
          <AppSidebar />
        </div>
        <SidebarInset>
          <AppHeader />
          <main className="flex-1 content-area">{children}</main>
          <AppFooter />
        </SidebarInset>
        <QuickActionsWidget />
        <QuickNotesWidget />
        <CommandPalette />
        <KeyboardShortcutsDialog />
        <VoiceAssistantButton />
      </SidebarProvider>
    </Providers>
  );
}
