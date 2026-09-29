"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Stable no-op subscribe to avoid hydration mismatch
const emptySubscribe = () => () => {};

interface DarkModeToggleProps {
  /** Show a tooltip on hover. Default: true */
  withTooltip?: boolean;
  /** Additional class names for the button */
  className?: string;
}

/**
 * DarkModeToggle — A minimal, elegant theme switcher button.
 *
 * Displays a Sun icon in dark mode (click → light) and a Moon icon
 * in light mode (click → dark), with a smooth rotate + scale transition.
 * Uses `next-themes` under the hood and avoids hydration mismatches
 * via `useSyncExternalStore`.
 */
export function DarkModeToggle({
  withTooltip = true,
  className,
}: DarkModeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();

  // Client-only mount gate — prevents SSR → client icon mismatch
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const isDark = resolvedTheme === "dark";

  const toggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  const button = (
    <Button
      variant="ghost"
      size="icon"
      className={`h-9 w-9 text-muted-foreground hover:text-foreground transition-all duration-200 ${className ?? ""}`}
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Relative container keeps both icons in the same slot */}
      <span className="relative inline-flex h-4 w-4">
        <Sun
          className={[
            "h-4 w-4 absolute inset-0 transition-all duration-300",
            isDark
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100",
          ].join(" ")}
        />
        <Moon
          className={[
            "h-4 w-4 absolute inset-0 transition-all duration-300",
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0",
          ].join(" ")}
        />
      </span>
    </Button>
  );

  // Don't render anything on the server to avoid flash
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={`h-9 w-9 ${className ?? ""}`}
        aria-hidden
        tabIndex={-1}
      >
        <span className="relative inline-flex h-4 w-4" />
      </Button>
    );
  }

  if (withTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-medium">
          {isDark ? "Light Mode" : "Dark Mode"}
          <kbd className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted rounded border border-border">
            <span className="text-xs">⌘</span>
            <span>⇧</span>
            <span>D</span>
          </kbd>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
