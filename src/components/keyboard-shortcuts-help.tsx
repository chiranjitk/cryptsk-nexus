"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard, ArrowLeftRight, Zap, Settings2, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────────────

interface ShortcutEntry {
  keys: string[];
  action: string;
}

type CategoryId = "navigation" | "actions" | "view" | "system";

interface ShortcutCategory {
  id: CategoryId;
  label: string;
  shortcuts: ShortcutEntry[];
}

// ─── Category Color Config ──────────────────────────────────────

const CATEGORY_STYLES: Record<
  CategoryId,
  { badge: string; dot: string; icon: React.ReactNode }
> = {
  navigation: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    dot: "bg-red-500",
    icon: <ArrowLeftRight className="size-3.5" />,
  },
  actions: {
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    dot: "bg-teal-500",
    icon: <Zap className="size-3.5" />,
  },
  view: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    dot: "bg-amber-500",
    icon: <Monitor className="size-3.5" />,
  },
  system: {
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    dot: "bg-purple-500",
    icon: <Settings2 className="size-3.5" />,
  },
};

// ─── Shortcut Data ─────────────────────────────────────────────

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    id: "navigation",
    label: "Navigation",
    shortcuts: [
      { keys: ["Ctrl", "K"], action: "Open Command Palette" },
      { keys: ["Ctrl", "1"], action: "Go to Dashboard" },
      { keys: ["Ctrl", "2"], action: "Go to Subscribers" },
      { keys: ["Ctrl", "3"], action: "Go to Plans" },
      { keys: ["Ctrl", "4"], action: "Go to Payments" },
      { keys: ["Ctrl", "5"], action: "Go to Complaints" },
      { keys: ["Ctrl", "6"], action: "Go to Devices" },
      { keys: ["Alt", "←"], action: "Go Back" },
      { keys: ["Alt", "→"], action: "Go Forward" },
    ],
  },
  {
    id: "actions",
    label: "Actions",
    shortcuts: [
      { keys: ["Ctrl", "N"], action: "New Subscriber" },
      { keys: ["N"], action: "New (context-dependent)" },
      { keys: ["E"], action: "Edit (context-dependent)" },
      { keys: ["D"], action: "Delete (context-dependent)" },
      { keys: ["Ctrl", "F"], action: "Search current page" },
      { keys: ["Ctrl", "E"], action: "Export CSV" },
    ],
  },
  {
    id: "view",
    label: "View",
    shortcuts: [
      {
        keys: ["Ctrl", "Shift", "D"],
        action: "Toggle Dark / Light Mode",
      },
    ],
  },
  {
    id: "system",
    label: "System",
    shortcuts: [
      { keys: ["?"], action: "Show keyboard shortcuts" },
      { keys: ["Esc"], action: "Close dialog / palette" },
      { keys: ["Ctrl", ","], action: "Open Settings" },
    ],
  },
];

// ─── Page navigation map for Ctrl+1–6 ──────────────────────────

const PAGE_SHORTCUT_MAP: Record<string, { page: string; section: string }> = {
  "1": { page: "Dashboard", section: "MAIN" },
  "2": { page: "Subscribers", section: "MAIN" },
  "3": { page: "Plans", section: "MAIN" },
  "4": { page: "Payments", section: "MAIN" },
  "5": { page: "Complaints", section: "OPERATIONS" },
  "6": { page: "Devices", section: "NETWORK" },
};

// ─── Helper: is focus in an input-like element ─────────────────

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (active as HTMLElement).isContentEditable
  );
}

// ─── Kbd Component ─────────────────────────────────────────────

function Kbd({
  keys,
  className,
  compact,
}: {
  keys: string[];
  className?: string;
  /** When true, renders a slightly smaller variant */
  compact?: boolean;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/60 bg-gradient-to-b from-muted to-muted/80 font-mono text-[11px] font-medium text-foreground shadow-[0_1px_0_1px_hsl(var(--border)/0.3)]",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        className
      )}
    >
      {keys.map((key, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="text-muted-foreground/60 mx-px">+</span>
          )}
          <span className="leading-none">{key}</span>
        </React.Fragment>
      ))}
    </kbd>
  );
}

// ─── Category Badge ────────────────────────────────────────────

function CategoryBadge({ categoryId, label }: { categoryId: CategoryId; label: string }) {
  const style = CATEGORY_STYLES[categoryId];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        style.badge
      )}
    >
      <span className={cn("inline-block size-1.5 rounded-full", style.dot)} />
      {label}
    </span>
  );
}

// ─── Shortcut Row ──────────────────────────────────────────────

function ShortcutRow({ shortcut }: { shortcut: ShortcutEntry }) {
  const hasModifier = shortcut.keys.some(
    (k) => k === "Ctrl" || k === "Meta" || k === "Alt" || k === "Shift"
  );

  return (
    <div className="group flex items-center justify-between gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60 active:bg-muted/80">
      <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
        {shortcut.action}
      </span>
      <div className="shrink-0 flex items-center gap-1.5">
        {/* Windows/Linux keys */}
        <Kbd keys={shortcut.keys} />
        {/* macOS variant */}
        {hasModifier && shortcut.keys.length > 1 && (
          <Kbd
            keys={shortcut.keys.map((k) =>
              k === "Ctrl" ? "⌘" : k === "Alt" ? "⌥" : k
            )}
            className="hidden sm:inline-flex opacity-70"
          />
        )}
      </div>
    </div>
  );
}

// ─── KeyboardShortcutsDialog ────────────────────────────────────

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="animate-dialog-enter sm:max-w-[520px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <div className="flex items-center justify-center size-8 rounded-lg bg-red-100 dark:bg-red-900/30">
                <Keyboard className="size-4 text-red-600 dark:text-red-400" />
              </div>
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription className="text-sm">
              Navigate faster with keyboard shortcuts. Press{" "}
              <Kbd keys={["?"]} compact /> to toggle this panel.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Shortcuts list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {SHORTCUT_CATEGORIES.map((category) => (
              <div key={category.id}>
                {/* Category header with badge */}
                <div className="flex items-center gap-2 mb-2.5">
                  <CategoryBadge
                    categoryId={category.id}
                    label={category.label}
                  />
                </div>

                {/* Shortcut rows */}
                <div className="space-y-0.5 rounded-lg border border-border/50 bg-muted/20 p-1">
                  {category.shortcuts.map((shortcut) => (
                    <ShortcutRow key={shortcut.action} shortcut={shortcut} />
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center px-6 py-3 border-t border-border bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            On macOS, replace <Kbd keys={["Ctrl"]} compact /> with{" "}
            <Kbd keys={["⌘"]} compact /> and{" "}
            <Kbd keys={["Alt"]} compact /> with{" "}
            <Kbd keys={["⌥"]} compact />
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Floating Help Button ──────────────────────────────────────

function FloatingHelpButton({
  onClick,
}: {
  onClick: () => void;
}) {
  // Lazily initialise from sessionStorage to avoid a cascading render
  const [hasBeenClicked, setHasBeenClicked] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("kb-shortcuts-help-clicked") === "true";
  });

  const handleClick = () => {
    sessionStorage.setItem("kb-shortcuts-help-clicked", "true");
    setHasBeenClicked(true);
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Open keyboard shortcuts"
      className={cn(
        // Positioning & sizing
        "fixed bottom-6 right-6 z-40",
        "flex items-center justify-center size-10 rounded-full",
        // Glass-morphism background
        "border border-border/40 bg-background/60 backdrop-blur-xl",
        "shadow-lg shadow-black/5",
        // Text/icon
        "text-muted-foreground hover:text-foreground",
        // Transitions
        "transition-all duration-200",
        "hover:scale-110 hover:shadow-xl hover:bg-background/80 hover:border-border/60",
        "active:scale-95",
        // Desktop only
        "hidden md:flex",
        // Pulse animation on first visit
        !hasBeenClicked && "animate-pulse-glow"
      )}
    >
      <span className="text-sm font-semibold leading-none">?</span>
    </button>
  );
}

// ─── KeyboardShortcutsProvider ──────────────────────────────────

export function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const themeToggledRef = useRef(false);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Reset the per-keydown toggle guard
      themeToggledRef.current = false;

      const isMod = e.metaKey || e.ctrlKey;

      // ── ? → Toggle help dialog ────────────────────────────
      if (e.key === "?" && !isInputFocused()) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
        return;
      }

      // ── Escape → Close help dialog ────────────────────────
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }

      // ── Ctrl+Shift+D → Toggle theme ───────────────────────
      if (isMod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        e.stopPropagation();
        // Use a ref guard to prevent double-toggling if another
        // listener (e.g. the header) also fires on the same event.
        if (!themeToggledRef.current) {
          themeToggledRef.current = true;
          setTheme(theme === "dark" ? "light" : "dark");
        }
        return;
      }

      // ── Ctrl+N → New Subscriber ──────────────────────────
      if (isMod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        e.stopPropagation();
        setCurrentPage("Subscribers", "MAIN");
        return;
      }

      // ── Ctrl+1 … Ctrl+6 → Quick page navigation ──────────
      if (isMod && !e.shiftKey && !e.altKey) {
        const digit = e.key;
        if (digit >= "1" && digit <= "6") {
          const target = PAGE_SHORTCUT_MAP[digit];
          if (target) {
            e.preventDefault();
            setCurrentPage(target.page, target.section);
            return;
          }
        }
      }
    },
    [open, theme, setTheme, setCurrentPage]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {children}
      <KeyboardShortcutsDialog open={open} onOpenChange={setOpen} />
      <FloatingHelpButton onClick={() => setOpen((prev) => !prev)} />
    </>
  );
}

// ─── Sidebar shortcut badge component ──────────────────────────

export function SidebarShortcutBadge({
  keys,
}: {
  keys: string[];
}) {
  return (
    <kbd className="ml-auto hidden group-data-[collapsible=icon]:hidden lg:inline-flex items-center gap-0.5 px-1 text-[9px] font-mono font-normal text-[#475569] shrink-0 opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150">
      {keys.map((key, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-[#334155]">+</span>}
          <span className="leading-none tracking-wide">
            {key === "Ctrl" ? "⌃" : key}
          </span>
        </React.Fragment>
      ))}
    </kbd>
  );
}

// ─── Sidebar shortcut map for key nav items ─────────────────────

export const SIDEBAR_SHORTCUT_MAP: Record<string, string[]> = {
  Dashboard: ["Ctrl", "1"],
  Subscribers: ["Ctrl", "2"],
  Plans: ["Ctrl", "3"],
  Payments: ["Ctrl", "4"],
  Complaints: ["Ctrl", "5"],
  Devices: ["Ctrl", "6"],
};
