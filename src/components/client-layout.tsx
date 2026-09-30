"use client";

import React from "react";

// ClientLayout is now a thin wrapper.
// The actual AppShell (sidebar, header, footer) is rendered inside
// page-shell.tsx only for authenticated users. Login page gets
// no chrome. This avoids double-wrapping and reduces initial
// compilation memory.
export function ClientLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
