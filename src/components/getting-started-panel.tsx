"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Rocket,
  Building2,
  Users,
  CreditCard,
  MapPin,
  LayoutDashboard,
  X,
  CircleHelp,
  PartyPopper,
  Sparkles,
  LayoutGrid,
  Cpu,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  page: string;
  section: string;
  icon: React.ElementType;
}

// ─── Constants ────────────────────────────────────────────────

const STORAGE_KEY_PROGRESS = "cryptsk-onboarding-progress";
const STORAGE_KEY_DISMISSED = "cryptsk-onboarding-dismissed";

const STEPS: OnboardingStep[] = [
  {
    id: "isp-profile",
    title: "Complete your ISP Profile",
    description:
      "Set up your company details, branding, and contact information",
    page: "ISP Profile",
    section: "SETTINGS",
    icon: Building2,
  },
  {
    id: "add-subscriber",
    title: "Add your first Subscriber",
    description: "Register a new customer and assign them a plan",
    page: "Subscribers",
    section: "MAIN",
    icon: Users,
  },
  {
    id: "create-plan",
    title: "Create a Plan",
    description:
      "Define internet plans with speeds, data limits, and pricing",
    page: "Plans",
    section: "MAIN",
    icon: CreditCard,
  },
  {
    id: "setup-areas",
    title: "Set up Areas",
    description:
      "Add your service coverage areas for subscriber management",
    page: "Areas",
    section: "SETTINGS",
    icon: MapPin,
  },
  {
    id: "explore-dashboard",
    title: "Explore the Dashboard",
    description:
      "View real-time metrics, revenue insights, and activity feed",
    page: "Dashboard",
    section: "MAIN",
    icon: LayoutDashboard,
  },
];

const TOTAL_STEPS = STEPS.length;

// ─── Confetti Particles ───────────────────────────────────────

const CONFETTI_COLORS = [
  "#DC2626",
  "#0D9488",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#10B981",
  "#3B82F6",
  "#EF4444",
];

function ConfettiParticle({ delay, color, left, size }: { delay: number; color: string; left: number; size: number }) {
  return (
    <span
      className="absolute rounded-sm animate-confetti pointer-events-none"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        left: `${left}%`,
        top: "-10px",
        animationDelay: `${delay}ms`,
        opacity: 0,
      }}
    />
  );
}

function ConfettiCelebration() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    delay: Math.random() * 2000,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: Math.random() * 100,
    size: 4 + Math.random() * 8,
  }));

  return (
    <div className="relative w-full h-20 overflow-hidden rounded-lg my-2">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} {...p} />
      ))}
    </div>
  );
}

// ─── Stats Pills ──────────────────────────────────────────────

const STATS_PILLS = [
  { label: "46+ Pages", icon: LayoutGrid },
  { label: "1200+ Features", icon: Sparkles },
  { label: "AI-Powered", icon: Cpu },
];

function StatsPills() {
  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-white/15">
      {STATS_PILLS.map((stat) => {
        const Icon = stat.icon;
        return (
          <span
            key={stat.label}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-medium border border-white/20"
          >
            <Icon className="size-3.5" />
            {stat.label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Help Button (bottom-left corner) ─────────────────────────

function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 left-6 z-50",
        "flex items-center justify-center",
        "w-10 h-10 rounded-full",
        "bg-[#DC2626] text-white shadow-lg",
        "hover:bg-[#B91C1C] hover:scale-110",
        "active:scale-95",
        "transition-all duration-200",
        "animate-pulse-once"
      )}
      aria-label="Open Getting Started guide"
    >
      <CircleHelp className="size-5" />
    </button>
  );
}

// ─── Step Item ────────────────────────────────────────────────

function StepItem({
  step,
  checked,
  onToggle,
  onNavigate,
}: {
  step: OnboardingStep;
  checked: boolean;
  onToggle: (id: string) => void;
  onNavigate: (page: string, section: string) => void;
}) {
  const Icon = step.icon;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 p-3 rounded-lg transition-all duration-300",
        "hover:bg-white/10",
        checked && "opacity-60"
      )}
    >
      {/* Checkbox */}
      <div className="pt-0.5">
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle(step.id)}
          className={cn(
            "size-5 rounded-md border-2 transition-all duration-200",
            checked
              ? "bg-[#0D9488] border-[#0D9488] data-[state=checked]:bg-[#0D9488] data-[state=checked]:border-[#0D9488]"
              : "border-white/40 data-[state=checked]:bg-[#0D9488] data-[state=checked]:border-[#0D9488] hover:border-white/70"
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              "size-4 shrink-0 transition-colors",
              checked ? "text-[#0D9488]" : "text-white/70"
            )}
          />
          <span
            className={cn(
              "text-sm font-semibold transition-all",
              checked
                ? "text-white/60 line-through"
                : "text-white"
            )}
          >
            {step.title}
          </span>
        </div>
        <p className="text-xs text-white/50 mt-0.5 ml-6">{step.description}</p>
      </div>

      {/* Go Button */}
      {!checked && (
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "shrink-0 mt-0.5",
            "text-[#5EEAD4] hover:text-[#5EEAD4]/90",
            "hover:bg-[#0D9488]/20",
            "text-xs font-semibold h-7 px-2.5"
          )}
          onClick={() => onNavigate(step.page, step.section)}
        >
          Go
        </Button>
      )}

      {checked && (
        <CheckCircle2 className="size-4 shrink-0 text-[#0D9488] mt-0.5" />
      )}
    </div>
  );
}

// ─── Main Panel Component ─────────────────────────────────────

export function GettingStartedPanel() {
  const { setCurrentPage } = useAppStore();

  // ── Helpers to safely read localStorage (SSR-safe) ──
  const readProgress = (): Set<string> => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PROGRESS);
      if (stored) {
        const parsed: string[] = JSON.parse(stored);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {
      // Silently ignore parse errors
    }
    return new Set();
  };

  const readDismissed = (): boolean => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY_DISMISSED) === "true";
    } catch {
      return false;
    }
  };

  // ── State (lazy initializers read from localStorage) ──
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(readProgress);
  const wasDismissed = readDismissed();
  const [isVisible, setIsVisible] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  // ── Derived values ──
  const completedCount = completedSteps.size;
  const progressPercent = TOTAL_STEPS > 0 ? (completedCount / TOTAL_STEPS) * 100 : 0;
  const allCompleted = completedCount === TOTAL_STEPS;

  // Ref to track dismissal across re-renders
  const dismissedRef = React.useRef(wasDismissed);

  // Show panel after a brief delay (skip if previously dismissed)
  useEffect(() => {
    if (wasDismissed) return;
    const timer = setTimeout(() => setIsVisible(true), 300);
    return () => clearTimeout(timer);
  }, [wasDismissed]);

  // ── Handlers ──
  const toggleStep = useCallback((stepId: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }

      // Persist to localStorage
      localStorage.setItem(
        STORAGE_KEY_PROGRESS,
        JSON.stringify([...next])
      );

      // Check if all steps completed
      if (next.size === TOTAL_STEPS) {
        setTimeout(() => setShowCelebration(true), 300);
        setTimeout(() => setShowCelebration(false), 6000);
      } else {
        setShowCelebration(false);
      }

      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef) dismissedRef.current = true;
    setIsVisible(false);
    localStorage.setItem(STORAGE_KEY_DISMISSED, "true");
  }, []);

  const reopen = useCallback(() => {
    if (dismissedRef) dismissedRef.current = false;
    setIsVisible(true);
    localStorage.removeItem(STORAGE_KEY_DISMISSED);
  }, []);

  const navigateTo = useCallback(
    (page: string, section: string) => {
      setCurrentPage(page, section);
    },
    [setCurrentPage]
  );

  // ── Render ──
  return (
    <>
      {/* ── Main Panel ── */}
      {isVisible && (
        <div
          className={cn(
            "animate-in slide-in-from-bottom-4 fade-in duration-500"
          )}
        >
          <Card
            className={cn(
              "relative overflow-hidden border-0 shadow-lg",
              "bg-gradient-to-br from-[#DC2626] via-[#7F1D1D] to-[#0F766E]",
              "dark:from-[#B91C1C] dark:via-[#450A0A] dark:to-[#0D5D56]"
            )}
          >
            {/* Decorative background pattern */}
            <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
                  backgroundSize: "60px 60px, 40px 40px",
                }}
              />
            </div>

            {/* Close / Dismiss Button */}
            <button
              onClick={dismiss}
              className={cn(
                "absolute top-3 right-3 z-10",
                "flex items-center justify-center",
                "w-7 h-7 rounded-full",
                "bg-white/20 text-white/80 hover:text-white hover:bg-white/30",
                "transition-all duration-200"
              )}
              aria-label="Dismiss getting started panel"
            >
              <X className="size-3.5" />
            </button>

            <CardHeader className="relative pb-0">
              {/* Welcome */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/20">
                  <Rocket className="size-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-white text-lg">
                    Welcome to Cryptsk!
                  </CardTitle>
                  <CardDescription className="text-white/80 text-xs mt-0.5">
                    Here&apos;s how to get the most out of your ISP platform
                  </CardDescription>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/90">
                    {completedCount} of {TOTAL_STEPS} completed
                  </span>
                  <span className="text-xs font-bold text-white">
                    {Math.round(progressPercent)}%
                  </span>
                </div>
                <Progress
                  value={progressPercent}
                  className="h-2 bg-white/15 [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-[#FDE68A] [&>[data-slot=progress-indicator]]:to-[#0D9488]"
                />
              </div>
            </CardHeader>

            <CardContent className="relative space-y-1 pt-4">
              {/* Celebration */}
              {showCelebration && <ConfettiCelebration />}

              {/* Completion message */}
              {allCompleted && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0D9488]/20 border border-[#0D9488]/30 mb-2">
                  <PartyPopper className="size-5 text-[#FDE68A] shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Congratulations!
                    </p>
                    <p className="text-xs text-white/80">
                      You&apos;ve completed all onboarding steps. You&apos;re all
                      set to go!
                    </p>
                  </div>
                </div>
              )}

              {/* Steps Checklist */}
              <div className="space-y-0.5">
                {STEPS.map((step) => (
                  <StepItem
                    key={step.id}
                    step={step}
                    checked={completedSteps.has(step.id)}
                    onToggle={toggleStep}
                    onNavigate={navigateTo}
                  />
                ))}
              </div>

              {/* Quick Stats */}
              <StatsPills />

              {/* Dismiss link */}
              {!allCompleted && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={dismiss}
                    className="text-xs text-white/50 hover:text-white/80 transition-colors underline-offset-2 hover:underline"
                  >
                    Don&apos;t show this again
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Help / Reopen Button ── */}
      {!isVisible && !allCompleted && <HelpButton onClick={reopen} />}
    </>
  );
}
