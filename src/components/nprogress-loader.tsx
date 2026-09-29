"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import NProgress from "nprogress";

// Configure NProgress
NProgress.configure({
  showSpinner: false,
  trickleSpeed: 200,
  minimum: 0.08,
  easing: "ease",
  speed: 400,
});

export function NProgressLoader() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const routeChangeDone = useRef(false);
  const prevFetchingCount = useRef(0);

  // ── Route change listener ──
  useEffect(() => {
    routeChangeDone.current = false;
    NProgress.start();

    const timer = setTimeout(() => {
      NProgress.done();
      routeChangeDone.current = true;
    }, 300);

    return () => {
      clearTimeout(timer);
      NProgress.done();
    };
  }, [pathname]); // ✅ removed searchParams

  // ── React Query isFetching listener ──
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      const isFetching = queryClient.isFetching();

      if (isFetching > 0 && prevFetchingCount.current === 0) {
        if (routeChangeDone.current) {
          NProgress.start();
        }
      } else if (isFetching === 0 && prevFetchingCount.current > 0) {
        NProgress.done();
        routeChangeDone.current = true;
      }

      prevFetchingCount.current = isFetching;
    });

    return () => unsubscribe();
  }, [queryClient]);

  useEffect(() => {
    return () => {
      NProgress.done();
    };
  }, []);

  return null;
}