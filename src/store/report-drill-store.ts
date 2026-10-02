"use client";

// ─── Report Drill-Down Store ──────────────────────────────────────
// Cross-page handshake: a report row's "View 360°" action focuses a
// specific subscriber inside the 360° Customer View page.
//
// Usage (from any report page):
//   import { openSubscriber360 } from "@/store/report-drill-store";
//   onClick={() => openSubscriber360(row.subscriberId)}
//
// The 360 page subscribes to focusSubscriberId/focusSeq and consumes
// (then clears) the focus, exactly like app-store's pendingSubscriberAction.
// focusSeq guarantees the effect re-fires even if the SAME subscriber is
// drilled into twice in a row.

import { create } from "zustand";

interface ReportDrillStore {
  focusSubscriberId: string | null;
  focusSeq: number;
  setFocusSubscriber: (id: string) => void;
  clearFocus: () => void;
}

export const useReportDrillStore = create<ReportDrillStore>((set) => ({
  focusSubscriberId: null,
  focusSeq: 0,
  setFocusSubscriber: (id) => set({ focusSubscriberId: id, focusSeq: Date.now() }),
  clearFocus: () => set({ focusSubscriberId: null }),
}));

/**
 * Navigate to the 360° Customer View focused on a subscriber.
 * No-op when the id is missing (e.g. lifecycle events for deleted subscribers).
 */
export function openSubscriber360(subscriberId: string | null | undefined): void {
  if (!subscriberId) return;
  useReportDrillStore.getState().setFocusSubscriber(subscriberId);
  void (async () => {
    const { useAppStore } = await import("@/store/app-store");
    useAppStore.getState().setCurrentPage("360° Customer View", "SUBSCRIBERS");
  })();
}
