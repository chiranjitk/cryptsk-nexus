"use client";
import React from "react";
import dynamic from "next/dynamic";

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const pages: Record<string, React.ComponentType> = {
  Subscribers: dynamic(() => import("@/components/pages/subscribers-page"), { ssr: false, loading: PageLoader }),
  Plans: dynamic(() => import("@/components/pages/plans-page"), { ssr: false, loading: PageLoader }),
  "360° Customer View": dynamic(() => import("@/components/pages/subscriber-360-page"), { ssr: false, loading: PageLoader }),
  "Batch Provisioning": dynamic(() => import("@/components/pages/batch-provisioning-page"), { ssr: false, loading: PageLoader }),
};

export function loadPage(name: string): React.ComponentType | null {
  return pages[name] || null;
}
