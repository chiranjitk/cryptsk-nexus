"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";

/**
 * Hook that fetches unread notification count and open complaint count
 * from the API and updates the global store. Runs on mount and refreshes
 * every 60 seconds. Only fires when the user is authenticated.
 */
export function useBadgeCounts() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUnreadNotificationCount = useAppStore((s) => s.setUnreadNotificationCount);
  const setOpenComplaintCount = useAppStore((s) => s.setOpenComplaintCount);
  const mountedRef = useRef(true);

  const fetchCounts = async () => {
    try {
      const [notifRes, complaintRes] = await Promise.allSettled([
        fetch("/api/notifications/unread-count"),
        fetch("/api/complaints/open-count"),
      ]);

      if (notifRes.status === "fulfilled" && notifRes.value.ok) {
        const data = await notifRes.value.json();
        if (mountedRef.current) {
          setUnreadNotificationCount(data.count ?? 0);
        }
      }

      if (complaintRes.status === "fulfilled" && complaintRes.value.ok) {
        const data = await complaintRes.value.json();
        if (mountedRef.current) {
          setOpenComplaintCount(data.count ?? 0);
        }
      }
    } catch {
      // Silently fail — badges will show 0 instead of stale data
    }
  };

  useEffect(() => {
    // Only fetch when authenticated to avoid 401 spam on login page
    if (!isAuthenticated) return;

    mountedRef.current = true;
    fetchCounts();

    // Refresh every 60 seconds
    const interval = setInterval(fetchCounts, 60_000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);
}
