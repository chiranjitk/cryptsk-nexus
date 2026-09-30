"use client";

import React, { lazy, Suspense, useSyncExternalStore, useEffect, useState, useCallback, Component } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/auth-store';
import { PAGE_LOADERS } from '@/lib/page-loaders';

// ─── Lazy-load extended CSS (14K lines of animations, custom components) ──
// This file is loaded only after authentication, keeping the initial
// login page compilation under 500MB instead of 3.4GB.
let extendedCssLoaded = false;
function loadExtendedCss() {
  if (extendedCssLoaded || typeof document === 'undefined') return;
  extendedCssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/globals-extended.css';
  document.head.appendChild(link);
}

// ─── Hydration guard ───────────────────────────────────────
// Prevents Radix UI hydration mismatch (auto-generated IDs differ
// between server and client). Same pattern used in AppShell.
const emptySubscribe = () => () => {};

// ─── Lazy component cache ──────────────────────────────────
// React.lazy() must be called once per page label — if we called
// it on every render we'd create a new lazy component each time,
// losing the Suspense cache.  The Map ensures each label maps to
// exactly one lazy component instance.
const lazyComponentCache = new Map<
  string,
  React.LazyExoticComponent<React.ComponentType>
>();

function getLazyComponent(
  pageName: string
): React.LazyExoticComponent<React.ComponentType> | null {
  const cached = lazyComponentCache.get(pageName);
  if (cached) return cached;

  const loader = PAGE_LOADERS[pageName];
  if (!loader) return null;

  const Component = lazy(loader);
  lazyComponentCache.set(pageName, Component);
  return Component;
}

// ─── Loading spinner ────────────────────────────────────────
function PageLoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading page…</p>
      </div>
    </div>
  );
}

// ─── Page-not-found fallback ───────────────────────────────
function PageNotFound({ pageName }: { pageName: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <AlertTriangle className="h-12 w-12 text-amber-500" />
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">Page not found</p>
        <p className="text-sm text-muted-foreground mt-1">
          No loader registered for &ldquo;{pageName}&rdquo;
        </p>
      </div>
    </div>
  );
}

// ─── Chunk-error boundary ────────────────────────────────
class ChunkErrorBoundary extends Component<
  { children: React.ReactNode; pageName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; pageName: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    const msg = error?.message ?? '';
    if (
      msg.includes('Failed to load chunk') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk')
    ) {
      return { hasError: true, error };
    }
    // Let non-chunk errors propagate to the global error boundary
    return { hasError: false, error: null };
  }

  handleRetry = () => {
    // Evict the cached lazy component so it gets re-created on next render
    lazyComponentCache.delete(this.props.pageName);
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <div className="text-center">
            <p className="text-base font-semibold text-foreground">Page chunk failed to load</p>
            <p className="text-sm text-muted-foreground mt-1">
              This can happen during development when webpack is compiling. Please retry.
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Loader2 className="h-4 w-4" />
            Retry Loading
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── LazyPage ───────────────────────────────────────────────
// Resolves the currentPage label to a lazy-loaded component.
// Wrapped in Suspense so the loading spinner shows while the
// chunk is being fetched over the network.
function LazyPage({ pageName }: { pageName: string }) {
  const Component = getLazyComponent(pageName);

  if (!Component) {
    return <PageNotFound pageName={pageName} />;
  }

  return (
    <ChunkErrorBoundary pageName={pageName}>
      <Suspense fallback={<PageLoadingSpinner />}>
        <Component />
      </Suspense>
    </ChunkErrorBoundary>
  );
}

// ─── AuthenticatedShell (exported as default) ────────────────
// This is the single entry point that ties the app together.
// page.tsx renders this only after authentication is confirmed.
export default function AuthenticatedShell() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const currentPage = useAppStore((s) => s.currentPage);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Load extended CSS on first authenticated render
  useEffect(() => { loadExtendedCss(); }, []);

  if (!mounted || !isAuthenticated) {
    return null;
  }

  // SelfCare portal has its own layout — render without AppShell
  if (currentPage === 'SelfCare') {
    return <LazyPage pageName="SelfCare" />;
  }

  return (
    <AppShell>
      <LazyPage pageName={currentPage} />
    </AppShell>
  );
}
