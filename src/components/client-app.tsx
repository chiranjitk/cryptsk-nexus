"use client";

import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { navGroups } from "@/lib/nav-config";
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

// ─── Hash deep-link validation table ─────────────────────────
// Valid pages = nav-config page labels (flattened with their owning group id
// as the sidebar section) plus the two non-sidebar pages SelfCare and Login.
// Lookup is case-insensitive; unknown hashes are ignored (no PageNotFound).
const HASH_PAGE_INDEX: Map<string, { label: string; section?: string }> = (() => {
  const index = new Map<string, { label: string; section?: string }>();
  for (const group of navGroups) {
    for (const item of group.items) {
      if (!index.has(item.label.toLowerCase())) {
        index.set(item.label.toLowerCase(), { label: item.label, section: group.id });
      }
    }
  }
  index.set("selfcare", { label: "SelfCare", section: "SELF-CARE" });
  index.set("login", { label: "Login" });
  return index;
})();

function resolveHashPage(hash: string): { label: string; section?: string } | null {
  if (!hash) return null;
  try {
    const raw = decodeURIComponent(hash).replace(/^\//, "").trim();
    if (!raw) return null;
    return HASH_PAGE_INDEX.get(raw.toLowerCase()) ?? null;
  } catch {
    return null; // malformed percent-encoding → treat as unknown
  }
}

// ─── Root Page Router ─────────────────────────────────────────
export default function ClientApp() {
  const { isAuthenticated, isLoading, isLoggingIn } = useAuthStore();
  const { currentPage, setCurrentPage } = useAppStore();
  const searchParams = useSearchParams();

  // ── ?portal=selfcare deep-link (one-shot per mount) ──────────
  // portalHandledRef keeps this effect from re-firing when currentPage changes
  // later — without it, navigating away from SelfCare while ?portal=selfcare is
  // still in the URL immediately yanked the user back (navigation trap). The
  // first evaluation that sees portal=selfcare consumes this mount's query and
  // flips the ref, whether or not navigation was needed (already on SelfCare).
  const portalHandledRef = React.useRef(false);
  useEffect(() => {
    if (portalHandledRef.current) return;
    if (searchParams.get("portal") !== "selfcare") return;
    portalHandledRef.current = true;
    if (currentPage !== "SelfCare") setCurrentPage("SelfCare", "SELF-CARE");
  }, [searchParams, currentPage, setCurrentPage]);

  // ── Sync restored auth user into app-store (sidebar identity) ──
  // auth-store's checkAuth() restores the real user after a refresh, but
  // app-store.user stayed DEFAULT_USER ("U · operator") because only the
  // interactive login flow called setUser(). Mirror login-page's mapping;
  // the id !== "" guard keeps an interactive login authoritative.
  useEffect(() => {
    if (!isAuthenticated) return;
    const authUser = useAuthStore.getState().user;
    if (!authUser || useAppStore.getState().user.id !== "") return;
    const fullWithIsp = useAuthStore.getState().userFull as { ispName?: string } | null;
    const ispName = fullWithIsp?.ispName;
    useAppStore.getState().setUser({
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      role: authUser.role,
      avatarUrl: authUser.avatarUrl,
      ...(ispName ? { ispName } : {}),
    });
  }, [isAuthenticated]);

  // ── Two-way hash ⇄ currentPage sync ──────────────────────────
  useEffect(() => {
    // (a) One-time mount sync: location.hash → currentPage
    const initial = resolveHashPage(window.location.hash.slice(1));
    if (initial && useAppStore.getState().currentPage !== initial.label) {
      useAppStore.getState().setCurrentPage(initial.label, initial.section);
    }

    // (b) currentPage → location.hash. Registered AFTER the mount sync so it
    // can't clobber the deep link; replaceState doesn't fire hashchange (no
    // loops) and the inequality guard skips redundant writes.
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.currentPage === prev.currentPage) return;
      const encoded = `#${encodeURIComponent(state.currentPage)}`;
      if (window.location.hash !== encoded) {
        history.replaceState(null, "", encoded);
      }
    });

    // (c) hashchange (back/forward, manual edits) → currentPage
    const handleHashChange = () => {
      const resolved = resolveHashPage(window.location.hash.slice(1));
      if (!resolved) return; // unknown/empty hash → leave page as-is
      if (useAppStore.getState().currentPage !== resolved.label) {
        useAppStore.getState().setCurrentPage(resolved.label, resolved.section);
      }
    };
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      unsubscribe();
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

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
