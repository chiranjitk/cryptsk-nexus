export function AppFooter() {
  return (
    <footer className="mt-auto border-t bg-background py-3 px-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="size-1.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" />
          <span>System operational</span>
          <span className="text-muted-foreground/40">·</span>
          <span>Phase 0 — Architecture Foundation</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono">v1.0.0-dev</span>
          <span className="text-muted-foreground/40">·</span>
          <span>© 2026 CRYPTSK PRIVATE LIMITED</span>
        </div>
      </div>
    </footer>
  );
}
