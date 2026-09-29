"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard, Command, ArrowUpDown, CornerDownLeft, ArrowLeftRight, Hash } from "lucide-react";

// ─── Shortcut Category Definitions ─────────────────────────────

interface ShortcutEntry {
  keys: string;
  label: string;
}

interface ShortcutCategory {
  title: string;
  icon: React.ReactNode;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Navigation",
    icon: <Command className="h-4 w-4 text-red-500" />,
    shortcuts: [
      { keys: "⌘K", label: "Open command palette" },
      { keys: "←/→", label: "Switch sidebar sections" },
      { keys: "1-9", label: "Quick page switch (first 9 pages)" },
    ],
  },
  {
    title: "General",
    icon: <Keyboard className="h-4 w-4 text-red-500" />,
    shortcuts: [
      { keys: "?", label: "Show keyboard shortcuts" },
      { keys: "Esc", label: "Close dialog / panel" },
    ],
  },
  {
    title: "Actions",
    icon: <CornerDownLeft className="h-4 w-4 text-red-500" />,
    shortcuts: [
      { keys: "↑/↓", label: "Navigate items in a list" },
      { keys: "Enter", label: "Select / confirm item" },
      { keys: "⌘⇧D", label: "Toggle dark / light theme" },
    ],
  },
];

// ─── Key Display Component ─────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 text-xs font-mono font-medium text-foreground bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]">
      {children}
    </kbd>
  );
}

// ─── Category Section Component ────────────────────────────────

function ShortcutCategorySection({ category }: { category: ShortcutCategory }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {category.icon}
        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
          {category.title}
        </h3>
      </div>
      <div className="space-y-2">
        {category.shortcuts.map((shortcut) => (
          <div
            key={shortcut.keys}
            className="flex items-center justify-between gap-4 py-1"
          >
            <span className="text-sm text-muted-foreground">{shortcut.label}</span>
            <Kbd>{shortcut.keys}</Kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Keyboard Shortcuts Dialog ────────────────────────────

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);

  // Listen for `?` key to open, only when no input/textarea/select is focused
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (isInputFocused) return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden" a11yTitle="Keyboard Shortcuts">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950/30">
            <Keyboard className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Keyboard Shortcuts
            </h2>
            <p className="text-xs text-muted-foreground">
              Press <Kbd>?</Kbd> anytime to open this dialog
            </p>
          </div>
        </div>

        {/* ── Shortcuts Grid ── */}
        <div className="px-6 py-4 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Two-column grid on sm+, single column on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            {SHORTCUT_CATEGORIES.map((category) => (
              <ShortcutCategorySection key={category.title} category={category} />
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t bg-muted/30 px-6 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd>?</Kbd>
              <span>Open shortcuts</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span>Close</span>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsDialog;
