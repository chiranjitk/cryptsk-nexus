export function AppFooter() {
  return (
    <footer className="mt-auto border-t bg-background py-3 px-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {/* Live status — pure CSS pulse, safe for SSR */}
          <div className="size-1.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" aria-hidden="true" />
          <span>System operational</span>
          <span className="text-muted-foreground/40">·</span>
          <span>ISP OSS/BSS Platform</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[11px]">
          <span>v0.2.1</span>
          <span className="text-muted-foreground/40">·</span>
          <span>PostgreSQL 18</span>
          <span className="text-muted-foreground/40">·</span>
          <span>IN</span>
          <span className="text-muted-foreground/40">·</span>
          <span>© 2026 CRYPTSK PRIVATE LIMITED</span>
        </div>
      </div>
    </footer>
  );
}
