"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ClientApp = dynamic(
  () => import("@/components/client-app"),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading Cryptsk…</p>
        </div>
      </div>
    ),
  }
);

export default function Page() {
  return <ClientApp />;
}
