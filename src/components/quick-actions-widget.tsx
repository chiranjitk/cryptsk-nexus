"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Plus,
  UserPlus,
  CreditCard,
  AlertCircle,
  FileText,
  Server,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Quick Action Definitions ──────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  page: string;
  section: string;
  color: string;
  bgColor: string;
  hoverBg: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "add-subscriber",
    label: "Add Subscriber",
    icon: <UserPlus className="size-5" />,
    page: "Subscribers",
    section: "MAIN",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    hoverBg: "hover:bg-emerald-50 dark:hover:bg-emerald-900/20",
  },
  {
    id: "collect-payment",
    label: "Collect Payment",
    icon: <CreditCard className="size-5" />,
    page: "Payments",
    section: "MAIN",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    hoverBg: "hover:bg-amber-50 dark:hover:bg-amber-900/20",
  },
  {
    id: "new-complaint",
    label: "New Complaint",
    icon: <AlertCircle className="size-5" />,
    page: "Complaints",
    section: "OPERATIONS",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    hoverBg: "hover:bg-red-50 dark:hover:bg-red-900/20",
  },
  {
    id: "create-invoice",
    label: "Create Invoice",
    icon: <FileText className="size-5" />,
    page: "Invoices",
    section: "FINANCE",
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    hoverBg: "hover:bg-violet-50 dark:hover:bg-violet-900/20",
  },
  {
    id: "add-device",
    label: "Add Device",
    icon: <Server className="size-5" />,
    page: "Devices",
    section: "NETWORK",
    color: "text-sky-600 dark:text-sky-400",
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    hoverBg: "hover:bg-sky-50 dark:hover:bg-sky-900/20",
  },
];

// ─── Quick Actions Widget ──────────────────────────────────────

export function QuickActionsWidget() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleAction = useCallback(
    (action: QuickAction) => {
      setCurrentPage(action.page, action.section);
      setIsOpen(false);
    },
    [setCurrentPage],
  );

  // Don't render for unauthenticated users (after all hooks)
  if (!isAuthenticated) return null;

  return (
    // Unified FAB stack (top slot). Anchored right-5 like all stack buttons;
    // sits above Quick Notes (bottom-20/sm) and Voice Assistant (bottom-5).
    // z-40 shared by the whole stack so no FAB paints over page modals or data.
    <div ref={containerRef} className="fixed bottom-[8.25rem] right-5 z-40 sm:bottom-[8.75rem]">
      {/* Expanded action items — open to the LEFT of the stack column so the
          Quick Notes / Voice Assistant buttons below stay uncovered */}
      <div
        className={cn(
          "absolute bottom-0 right-full mr-3 flex flex-col items-end gap-2 transition-all duration-200",
          isOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        {QUICK_ACTIONS.map((action, index) => (
          <div
            key={action.id}
            className={cn(
              "flex items-center gap-2 transition-all duration-200",
              isOpen
                ? "translate-x-0 opacity-100"
                : "translate-x-4 opacity-0",
            )}
            style={{
              transitionDelay: isOpen ? `${index * 40}ms` : "0ms",
            }}
          >
            <span
              className={cn(
                "text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md shadow-sm",
                "bg-background/90 backdrop-blur-sm border border-border/60 text-foreground/80",
              )}
            >
              {action.label}
            </span>
            <button
              onClick={() => handleAction(action)}
              aria-label={action.label}
              className={cn(
                "flex items-center justify-center size-10 rounded-full shadow-md transition-all duration-150",
                action.bgColor,
                action.color,
                action.hoverBg,
                "hover:scale-110 active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2",
              )}
            >
              {action.icon}
            </button>
          </div>
        ))}
      </div>

      {/* Main FAB Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggle}
            aria-label={isOpen ? "Close quick actions" : "Open quick actions"}
            title={isOpen ? "Close quick actions" : "Quick actions"}
            className={cn(
              // Stack-consistent size: 44px mobile / 48px desktop (matches
              // Quick Notes + Voice Assistant buttons in the same column).
              "flex items-center justify-center h-11 w-11 sm:h-12 sm:w-12 rounded-full shadow-lg transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2",
              isOpen
                ? "bg-slate-700 text-white hover:bg-slate-800 rotate-45"
                : "bg-[#DC2626] text-white hover:bg-[#B91C1C] hover:scale-105 active:scale-95",
            )}
          >
            {isOpen ? (
              <X className="size-5" />
            ) : (
              <Plus className="size-5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          className="text-xs font-medium"
        >
          {isOpen ? "Close" : "Quick Actions"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
