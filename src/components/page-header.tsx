"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  actions?: React.ReactNode;
  badge?: { text: string; variant?: "default" | "secondary" | "destructive" | "outline" };
  breadcrumbs?: { label: string; href?: string }[];
}

export default function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  badge,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <div className="animate-page-enter">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <li key={index} className="flex items-center gap-1">
                {index > 0 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                )}
                {crumb.href && index < breadcrumbs.length - 1 ? (
                  <a
                    href={crumb.href}
                    className="hover:text-foreground transition-colors duration-150"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span
                    className={cn(
                      index === breadcrumbs.length - 1
                        ? "text-foreground font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Main header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Icon in colored rounded container */}
          {Icon && (
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
              <Icon className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {title}
              </h1>
              {badge && (
                <Badge
                  variant={badge.variant ?? "secondary"}
                  className="text-xs font-medium"
                >
                  {badge.text}
                </Badge>
              )}
            </div>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons — right-aligned, wrap on narrow screens instead of overflowing */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 min-w-0 sm:shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
