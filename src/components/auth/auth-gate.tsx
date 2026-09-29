"use client";

import { useSession } from "next-auth/react";
import { LoginCard } from "@/components/auth/login-card";

// ============================================================
// CRYPTSK Nexus — AuthGate
// Renders LoginCard if unauthenticated, Dashboard if authenticated.
// This pattern satisfies the sandbox constraint (only / route).
// ============================================================

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  // Loading state — skeleton
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
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

  // Unauthenticated → show login
  if (!session) {
    return <LoginCard />;
  }

  // Authenticated → show the dashboard (children)
  return <>{children}</>;
}
