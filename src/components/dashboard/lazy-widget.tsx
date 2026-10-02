"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Dashboard lazy-widget infrastructure.
 *
 * The dashboard previously statically imported 40+ widgets → one giant bundle
 * that OOM-killed the dev server during compile (2.4 GB RSS) and fired ~30 API
 * requests the instant the page booted.
 *
 * This module provides:
 *  1. WidgetSkeleton        — shared loading placeholder (gradient shimmer)
 *  2. MountOnVisible        — defers mounting (and therefore data fetching)
 *                             until the placeholder is within `rootMargin` of
 *                             the viewport (IntersectionObserver, load-once)
 *  3. createLazyWidget      — combines next/dynamic chunk-splitting with
 *                             MountOnVisible so render-sites stay unchanged:
 *                               const Foo = createLazyWidget(
 *                                 () => import("./foo-widget"), "FooWidget");
 */

// ─── Widget Skeleton ─────────────────────────────────────────────

export function WidgetSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm p-6 space-y-4 relative overflow-hidden",
        className
      )}
      aria-busy="true"
      role="status"
    >
      <span className="sr-only">Loading widget…</span>
      {/* gradient wash — pure CSS, respects prefers-reduced-motion */}
      <div className="absolute inset-0 -translate-x-full animate-skeleton-wave bg-gradient-to-r from-transparent via-muted/40 to-transparent" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
    </div>
  );
}

// ─── Mount-on-visible (deferred data fetching + paced admission) ─

const OBSERVER_ROOT_MARGIN = "700px 0px";

/**
 * Mount pacing: widgets becoming visible simultaneously (fast scroll,
 * section expansion) each trigger a dynamic-import chunk compile + a burst
 * of API fetches on the server. On memory-constrained hosts those
 * simultaneous compiles spike RSS past the OOM ceiling. This queue admits
 * at most MAX_CONCURRENT_MOUNTS, releasing the next queued mount every
 * RELEASE_INTERVAL_MS — flattening the spike without perceptible UI lag
 * (skeletons shimmer meanwhile).
 */
const MAX_CONCURRENT_MOUNTS = 1;
const RELEASE_INTERVAL_MS = 600;

let activeMounts = 0;
const mountQueue: Array<() => void> = [];
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRelease() {
  if (releaseTimer) return;
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    activeMounts = Math.max(0, activeMounts - 1);
    const next = mountQueue.shift();
    if (next) {
      activeMounts++;
      next();
      scheduleRelease();
    }
  }, RELEASE_INTERVAL_MS);
}

function requestMountAdmission(proceed: () => void) {
  if (activeMounts < MAX_CONCURRENT_MOUNTS && mountQueue.length === 0) {
    activeMounts++;
    proceed();
    scheduleRelease();
  } else {
    mountQueue.push(proceed);
  }
}

export function MountOnVisible({
  children,
  minHeight = 200,
  className,
}: {
  children: React.ReactNode;
  minHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    // No IntersectionObserver (very old browsers / SSR fallback) → mount now
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          requestMountAdmission(() => setVisible(true));
        }
      },
      { rootMargin: OBSERVER_ROOT_MARGIN }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className={className}
      style={visible ? undefined : { minHeight }}
    >
      {visible ? children : <WidgetSkeleton />}
    </div>
  );
}

// ─── Lazy widget factory ─────────────────────────────────────────

type AnyProps = Record<string, unknown>;

export function createLazyWidget(
  importFn: () => Promise<Record<string, unknown>>,
  exportName: string,
  opts?: { minHeight?: number; className?: string }
) {
  const Inner = dynamic(
    () =>
      importFn().then((mod) => {
        const Comp = (mod as Record<string, unknown>)[exportName];
        if (typeof Comp !== "function" && typeof Comp !== "object") {
          throw new Error(
            `createLazyWidget: export "${exportName}" not found in lazy chunk`
          );
        }
        return { default: Comp as React.ComponentType<AnyProps> };
      }),
    { ssr: false, loading: () => <WidgetSkeleton /> }
  );

  function LazyWidget(props: AnyProps) {
    return (
      <MountOnVisible
        minHeight={opts?.minHeight}
        className={opts?.className}
      >
        <Inner {...props} />
      </MountOnVisible>
    );
  }
  LazyWidget.displayName = `Lazy(${exportName})`;
  return LazyWidget;
}
