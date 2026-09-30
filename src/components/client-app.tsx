"use client";

import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { Loader2 } from "lucide-react";

// ─── Global fetch interceptor ────────────────────────────────
if (typeof window !== "undefined") {
  const _originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/") && !init?.headers?.["Authorization"]) {
      try {
        const token = localStorage.getItem("cryptsk_auth_token");
        if (token) {
          init = init || {};
          init.headers = {
            ...(typeof init.headers === "object" ? init.headers : {}),
            Authorization: `Bearer ${token}`,
          };
        }
      } catch { /* ignore */ }
    }
    return _originalFetch.call(window, input, init);
  };
}

// ─── Dynamically loaded pages (separate chunks) ──────────────
const LoginPage = dynamic(
  () => import("@/components/pages/login-page"),
  { ssr: false }
);

const AuthenticatedShell = dynamic(
  () => import("@/components/page-shell"),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading application…</p>
        </div>
      </div>
    ),
  }
);

// ─── Root Page Router ─────────────────────────────────────────
export default function ClientApp() {
  const { isAuthenticated, isLoading, isLoggingIn } = useAuthStore();
  const { currentPage, setCurrentPage } = useAppStore();
  const searchParams = useSearchParams();

  useEffect(() => {
    const portal = searchParams.get("portal");
    if (portal === "selfcare" && currentPage !== "SelfCare") {
      setCurrentPage("SelfCare", "SELF-CARE");
    }
  }, [searchParams, currentPage, setCurrentPage]);

  if (isLoading && !isAuthenticated && !isLoggingIn) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-sm text-slate-500">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AuthenticatedShell />;
}
