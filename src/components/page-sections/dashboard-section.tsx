"use client";
import React from "react";
import dynamic from "next/dynamic";

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const pages: Record<string, React.ComponentType> = {
  Dashboard: dynamic(() => import("@/components/pages/dashboard-page"), { ssr: false, loading: PageLoader }),
};

export function loadPage(name: string): React.ComponentType | null {
  return pages[name] || null;
}
