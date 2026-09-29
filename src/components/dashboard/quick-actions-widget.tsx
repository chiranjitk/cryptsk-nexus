"use client";

import React, { useCallback } from "react";
import {
  UserPlus,
  FileText,
  MessageSquarePlus,
  MonitorSmartphone,
  Gauge,
  BarChart3,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Action Definitions ─────────────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  page: string;
  section: string;
  gradient: string;
  iconColor: string;
  ringColor: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "add-subscriber",
    label: "Add Subscriber",
    description: "New connection",
    icon: UserPlus,
    page: "Subscribers",
    section: "MAIN",
    gradient: "from-rose-500 to-red-600",
    iconColor: "text-rose-500 dark:text-rose-400",
    ringColor: "ring-rose-500/20",
  },
  {
    id: "create-invoice",
    label: "Create Invoice",
    description: "New bill",
    icon: FileText,
    page: "Invoices",
    section: "FINANCE",
    gradient: "from-red-500 to-red-700",
    iconColor: "text-red-500 dark:text-red-400",
    ringColor: "ring-red-500/20",
  },
  {
    id: "log-complaint",
    label: "Log Complaint",
    description: "Report issue",
    icon: MessageSquarePlus,
    page: "Complaints",
    section: "OPERATIONS",
    gradient: "from-orange-500 to-red-600",
    iconColor: "text-orange-500 dark:text-orange-400",
    ringColor: "ring-orange-500/20",
  },
  {
    id: "view-devices",
    label: "View Devices",
    description: "Network gear",
    icon: MonitorSmartphone,
    page: "Devices",
    section: "NETWORK",
    gradient: "from-amber-500 to-orange-600",
    iconColor: "text-amber-500 dark:text-amber-400",
    ringColor: "ring-amber-500/20",
  },
  {
    id: "run-speed-test",
    label: "Run Speed Test",
    description: "Bandwidth check",
    icon: Gauge,
    page: "Speed Test",
    section: "NETWORK",
    gradient: "from-red-600 to-rose-700",
    iconColor: "text-red-600 dark:text-red-400",
    ringColor: "ring-red-600/20",
  },
  {
    id: "generate-report",
    label: "Generate Report",
    description: "Analytics",
    icon: BarChart3,
    page: "Reports",
    section: "FINANCE",
    gradient: "from-rose-600 to-red-800",
    iconColor: "text-rose-600 dark:text-rose-400",
    ringColor: "ring-rose-600/20",
  },
];

// ─── Action Button ──────────────────────────────────────────────

function ActionButton({ action, onClick }: { action: QuickAction; onClick: (action: QuickAction) => void }) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      aria-label={action.label}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-2.5 rounded-xl",
        "border border-border/50 bg-card p-4 sm:p-5",
        "transition-all duration-200 ease-out",
        "hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.03]",
        "active:scale-[0.98] active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {/* Gradient background on hover */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300",
          "bg-gradient-to-br",
          action.gradient,
        )}
        style={{ opacity: 0 }}
        // We handle the opacity via CSS for cleaner animation
      />

      {/* Hover overlay */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-10 transition-opacity duration-300",
          "bg-gradient-to-br",
          action.gradient,
        )}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-2.5">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center rounded-xl p-2.5 sm:p-3",
            "bg-muted/60 ring-1 ring-inset",
            action.ringColor,
            "group-hover:ring-white/30 group-hover:bg-white/90 dark:group-hover:bg-black/60",
            "transition-all duration-300",
          )}
        >
          <Icon className={cn("h-5 w-5 sm:h-6 sm:w-6 transition-all duration-300", action.iconColor)} />
        </div>

        {/* Label */}
        <div className="text-center">
          <p className="text-xs font-semibold text-foreground leading-tight">
            {action.label}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
            {action.description}
          </p>
        </div>
      </div>

      {/* Bottom gradient accent bar */}
      <div
        className={cn(
          "absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-0 rounded-full",
          "bg-gradient-to-r",
          action.gradient,
          "group-hover:w-3/4 transition-all duration-300",
        )}
      />
    </button>
  );
}

// ─── Quick Actions Widget (Dashboard Card) ──────────────────────

export function DashboardQuickActionsWidget() {
  const handleAction = useCallback((action: QuickAction) => {
    useAppStore.getState().setCurrentPage(action.page, action.section);
  }, []);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 p-1.5 text-white shadow-sm">
              <Zap className="h-3.5 w-3.5" />
            </div>
            Quick Actions
          </CardTitle>
          <span className="text-[10px] font-medium text-muted-foreground px-2 py-0.5 rounded-full bg-muted/60 border border-border/50">
            6 shortcuts
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onClick={handleAction}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default DashboardQuickActionsWidget;
