"use client";

import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────
export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ElementType;
}

export interface EmptyStateProps {
  /** Lucide icon component (defaults to Inbox) */
  icon?: React.ElementType;
  /** Primary message displayed below the icon */
  title: string;
  /** Secondary description text */
  description?: string;
  /** Optional action button rendered below the description */
  action?: EmptyStateAction;
  /** Visual variant controlling icon container colors */
  variant?: "default" | "error" | "success" | "warning";
  /** Controls overall spacing — sm (p-6), md (p-8), lg (p-12) */
  size?: "sm" | "md" | "lg";
  /** Custom content rendered below the action area */
  children?: React.ReactNode;
  /** Additional class names for the outer wrapper */
  className?: string;
}

// ─── Variant Style Maps ──────────────────────────────────────────────────
const VARIANT_STYLES = {
  default: {
    container:
      "bg-muted/50 dark:bg-muted/30",
    icon: "text-muted-foreground/50",
    iconRing: "ring-muted/60 dark:ring-muted/40",
    title: "text-foreground",
    description: "text-muted-foreground",
    buttonVariant: "default" as const,
  },
  error: {
    container:
      "bg-red-50 dark:bg-red-950/30",
    icon: "text-red-500 dark:text-red-400",
    iconRing: "ring-red-200/60 dark:ring-red-800/40",
    title: "text-red-900 dark:text-red-100",
    description: "text-red-700/70 dark:text-red-300/70",
    buttonVariant: "destructive" as const,
  },
  success: {
    container:
      "bg-green-50 dark:bg-green-950/30",
    icon: "text-green-600 dark:text-green-400",
    iconRing: "ring-green-200/60 dark:ring-green-800/40",
    title: "text-green-900 dark:text-green-100",
    description: "text-green-700/70 dark:text-green-300/70",
    buttonVariant: "default" as const,
  },
  warning: {
    container:
      "bg-amber-50 dark:bg-amber-950/30",
    icon: "text-amber-600 dark:text-amber-400",
    iconRing: "ring-amber-200/60 dark:ring-amber-800/40",
    title: "text-amber-900 dark:text-amber-100",
    description: "text-amber-700/70 dark:text-amber-300/70",
    buttonVariant: "outline" as const,
  },
} as const;

// ─── Size Style Maps ─────────────────────────────────────────────────────
const SIZE_STYLES = {
  sm: {
    wrapper: "p-6",
    iconSize: "h-10 w-10",
    iconContainer: "h-14 w-14 rounded-xl",
    title: "text-sm",
    description: "text-xs",
    gap: "gap-2",
  },
  md: {
    wrapper: "p-8",
    iconSize: "h-7 w-7",
    iconContainer: "h-16 w-16 rounded-2xl",
    title: "text-base",
    description: "text-sm",
    gap: "gap-3",
  },
  lg: {
    wrapper: "p-12",
    iconSize: "h-9 w-9",
    iconContainer: "h-20 w-20 rounded-2xl",
    title: "text-lg",
    description: "text-sm",
    gap: "gap-4",
  },
} as const;

// ─── Component ───────────────────────────────────────────────────────────
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = "default",
  size = "md",
  children,
  className,
}: EmptyStateProps) {
  const styles = VARIANT_STYLES[variant];
  const sizeStyles = SIZE_STYLES[size];

  const ActionIcon = action?.icon;

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center animate-card-enter",
        "rounded-xl border border-border/50 bg-background/50",
        sizeStyles.wrapper,
        className
      )}
    >
      {/* Icon Container */}
      <div
        className={cn(
          "flex items-center justify-center ring-1",
          styles.container,
          styles.iconRing,
          sizeStyles.iconContainer,
          "mb-4"
        )}
      >
        <Icon className={cn(sizeStyles.iconSize, styles.icon)} />
      </div>

      {/* Text Content */}
      <div className={cn("flex flex-col items-center", sizeStyles.gap)}>
        <h3
          className={cn(
            "font-semibold leading-snug tracking-tight",
            styles.title,
            sizeStyles.title
          )}
        >
          {title}
        </h3>

        {description && (
          <p
            className={cn(
              "max-w-sm leading-relaxed",
              styles.description,
              sizeStyles.description
            )}
          >
            {description}
          </p>
        )}
      </div>

      {/* Action Button */}
      {action && (
        <div className="mt-4">
          <Button
            variant={styles.buttonVariant}
            onClick={action.onClick}
            className={cn(
              variant === "default" &&
                "bg-primary hover:bg-primary/90 text-primary-foreground",
              variant === "success" &&
                "bg-green-600 hover:bg-green-700 text-white dark:bg-green-600 dark:hover:bg-green-700"
            )}
          >
            {ActionIcon && <ActionIcon className="h-4 w-4 mr-1.5" />}
            {action.label}
          </Button>
        </div>
      )}

      {/* Custom Content */}
      {children && (
        <div className="mt-4 w-full max-w-sm">{children}</div>
      )}
    </div>
  );
}

export default EmptyState;
