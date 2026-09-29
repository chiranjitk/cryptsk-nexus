"use client";

import React, { useEffect, useState, useCallback } from "react";
import { type UsageData } from "@/store/subscriber-auth-store";
import { useSubscriberAuthStore } from "@/store/subscriber-auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  AlertTriangle,
  Calendar,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  TrendingUp,
  Zap,
  Loader2,
  Check,
  Star,
} from "lucide-react";
import { toast } from "sonner";

// ─── Gradient Icon Circle ───────────────────────────────────

function GradientIcon({ icon: Icon, from, to }: { icon: React.ElementType; from?: string; to?: string }) {
  return (
    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${from || "from-red-500"} ${to || "to-red-700"} flex items-center justify-center flex-shrink-0`}>
      <Icon className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(mb * 1024).toFixed(0)} KB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysRemaining(endDate: string | null): number {
  if (!endDate) return 0;
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
}

function barColor(totalMB: number, maxMB: number): string {
  const ratio = maxMB > 0 ? totalMB / maxMB : 0;
  if (ratio >= 0.8) return "from-red-500 to-rose-600";
  if (ratio >= 0.5) return "from-amber-500 to-orange-500";
  return "from-red-500 to-red-500";
}

// ─── Data Hook ────────────────────────────────────────────────

function useUsageData() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriber-auth/usage");
      const data = await res.json();
      if (data.success) {
        setUsage(data.data);
      } else {
        setError(data.error || "Failed to fetch usage data");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { usage, loading, error, refetch: fetchData };
}

// ─── Skeleton ─────────────────────────────────────────────────

function UsageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

// ─── Circular Progress (SVG) ──────────────────────────────────

function CircularProgress({
  percentage,
  used,
  total,
  isUnlimited,
}: {
  percentage: number;
  used: number;
  total: number | null;
  isUnlimited: boolean;
}) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const color =
    percentage >= 90
      ? "#ef4444"
      : percentage >= 70
        ? "#f59e0b"
        : "#10b981";

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-44 h-44">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            className="text-muted/30"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-foreground">{percentage}%</span>
          <span className="text-xs text-muted-foreground mt-0.5">used</span>
        </div>
      </div>
      <div className="text-center mt-3 space-y-0.5">
        <p className="text-sm font-semibold text-foreground">
          {formatMB(used)} used
        </p>
        <p className="text-xs text-muted-foreground">
          {isUnlimited ? "Unlimited" : `of ${formatMB(total ?? 0)}`}
        </p>
      </div>
    </div>
  );
}

// ─── Daily Bar Chart ──────────────────────────────────────────

function DailyUsageChart({
  dailyUsage,
}: {
  dailyUsage: { date: string; download: number; upload: number; total: number }[];
}) {
  const last30 = dailyUsage.slice(-30);
  const maxVal = Math.max(...last30.map((d) => d.total), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-[3px] h-48">
        {last30.map((d) => {
          const height = Math.max((d.total / maxVal) * 100, 3);
          const colorClass = barColor(d.total, maxVal);
          return (
            <div
              key={d.date}
              className="flex-1 group relative"
              title={`${formatDate(d.date)}: ${formatMB(d.total)} (↓${formatMB(d.download)} / ↑${formatMB(d.upload)})`}
            >
              {/* Stacked bars: download + upload */}
              <div className="w-full flex flex-col justify-end" style={{ height: `${height}%` }}>
                <div
                  className={`w-full rounded-t-sm bg-gradient-to-t ${colorClass} min-h-[2px]`}
                  style={{
                    height: maxVal > 0 ? `${(d.download / d.total) * 100}%` : "50%",
                  }}
                />
                <div
                  className="w-full rounded-b-sm bg-gradient-to-t from-red-400 to-red-300 min-h-[2px]"
                  style={{
                    height: maxVal > 0 ? `${(d.upload / d.total) * 100}%` : "50%",
                  }}
                />
              </div>

              {/* Tooltip on hover */}
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-popover border rounded-lg shadow-lg p-2 text-xs whitespace-nowrap pointer-events-none">
                <p className="font-medium">{formatDate(d.date)}</p>
                <p className="text-muted-foreground">
                  Total: {formatMB(d.total)}
                </p>
                <p className="text-red-600">↓ {formatMB(d.download)}</p>
                <p className="text-red-700">↑ {formatMB(d.upload)}</p>
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gradient-to-t from-red-500 to-red-500" />
          Download
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gradient-to-t from-red-400 to-red-300" />
          Upload
        </span>
      </div>
    </div>
  );
}

// ─── Plan Upgrade Dialog ─────────────────────────────────────

interface PlanItem {
  id: string;
  name: string;
  description: string;
  downloadSpeed: number;
  uploadSpeed: number;
  speedUnit: string;
  dataLimitGb: number | null;
  priceMonthly: number;
  priceQuarterly: number | null;
  priceHalfYearly: number | null;
  priceYearly: number | null;
  isPopular: boolean;
  category: string;
  validityDays: number;
  _count: { subscribers: number };
}

function UpgradePlanDialog({
  open,
  onOpenChange,
  currentPlanId,
  currentPlanName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlanId: string;
  currentPlanName: string;
}) {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedPlan(null);
      return;
    }
    setLoading(true);
    fetch("/api/subscriber-auth/plans")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setPlans(data.plans);
      })
      .catch(() => {
        toast.error("Failed to load plans");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSubmit = async () => {
    if (!selectedPlan) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/subscriber-auth/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PLAN_CHANGE",
          priority: "P3_MEDIUM",
          description: `Request to upgrade from Plan "${currentPlanName}" to Plan "${selectedPlan.name}" (₹${selectedPlan.priceMonthly}/month, ↓${selectedPlan.downloadSpeed} Mbps / ↑${selectedPlan.uploadSpeed} Mbps).`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Upgrade request submitted", {
          description: `Ticket ${data.complaint.ticketNumber} created. Admin will review shortly.`,
        });
        onOpenChange(false);
      } else {
        toast.error("Failed to submit", { description: data.error || "Please try again." });
      }
    } catch {
      toast.error("Network error", { description: "Could not reach the server." });
    } finally {
      setSubmitting(false);
    }
  };

  const upgradablePlans = plans.filter((p) => p.id !== currentPlanId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-500" />
            Upgrade Your Plan
          </DialogTitle>
          <DialogDescription>
            Select a new plan. An upgrade request will be sent to admin for approval.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading plans…</span>
          </div>
        ) : upgradablePlans.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No other plans available for upgrade.
          </div>
        ) : (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {upgradablePlans.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan)}
                  className={`relative w-full text-left p-3 rounded-lg border-2 transition-all duration-150 hover:shadow-sm ${
                    isSelected
                      ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                      : "border-border/60 hover:border-red-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {plan.name}
                        </span>
                        {plan.isPopular && (
                          <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-1.5 py-0">
                            <Star className="w-2.5 h-2.5 mr-0.5" /> Popular
                          </Badge>
                        )}
                      </div>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{plan.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <ArrowDown className="w-3 h-3" /> {plan.downloadSpeed} Mbps
                        </span>
                        <span className="flex items-center gap-0.5">
                          <ArrowUp className="w-3 h-3" /> {plan.uploadSpeed} Mbps
                        </span>
                        <span>
                          {plan.dataLimitGb ? `${plan.dataLimitGb} GB` : "Unlimited"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-foreground">₹{plan.priceMonthly}</p>
                      <p className="text-[10px] text-muted-foreground">/month</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedPlan || submitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-1.5" />
                Request Upgrade
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Component ────────────────────────────────────────────────

export default function SelfcareUsage() {
  const { usage, loading, error, refetch } = useUsageData();
  const { subscriber } = useSubscriberAuthStore();
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);

  if (loading) return <UsageSkeleton />;
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={refetch} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        No usage data available.
      </div>
    );
  }

  const isUnlimited = usage.dataLimit === null;
  const pct = isUnlimited ? 0 : Math.min(Math.round(usage.percentage), 100);
  const days = daysRemaining(usage.cycleEnd);
  const avgDaily =
    usage.dailyUsage.length > 0
      ? usage.dailyUsage.reduce((s, d) => s + d.total, 0) / usage.dailyUsage.length
      : 0;
  const downloadTotal = usage.dailyUsage.reduce((s, d) => s + d.download, 0);
  const uploadTotal = usage.dailyUsage.reduce((s, d) => s + d.upload, 0);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GradientIcon icon={Activity} from="from-red-500" to="to-red-700" />
            Data Usage
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor your data consumption this billing cycle
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5 border-border/50 bg-background hover:bg-muted/50">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Alerts */}
      {!isUnlimited && pct >= 80 && (
        <Card className="rounded-xl border-0 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <CardContent className="py-4 px-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {pct >= 100
                  ? "You have exceeded your data limit!"
                  : `You've used ${pct}% of your data limit`}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {pct >= 100
                  ? "Consider upgrading your plan to avoid service restrictions."
                  : "Consider monitoring your usage or upgrading your plan."}
              </p>
            </div>
            {!isUnlimited && pct >= 80 && (
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                onClick={() => setUpgradeDialogOpen(true)}
              >
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Upgrade Plan
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Circular Progress */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="py-6 flex items-center justify-center">
            <CircularProgress
              percentage={pct}
              used={usage.currentUsed}
              total={usage.dataLimit}
              isUnlimited={isUnlimited}
            />
          </CardContent>
        </Card>

        {/* Cycle Info */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={Calendar} from="from-red-500" to="to-cyan-600" />
              Billing Cycle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cycle Start</span>
              <span className="font-medium text-foreground">
                {formatDate(usage.cycleStart)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cycle End</span>
              <span className="font-medium text-foreground">
                {formatDate(usage.cycleEnd)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Days Remaining</span>
              <Badge
                className={`border-0 ${
                  days <= 3
                    ? "bg-red-100 text-red-700"
                    : days <= 7
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {days} day{days !== 1 ? "s" : ""}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avg. Daily Usage</span>
              <span className="font-medium text-foreground">
                {formatMB(avgDaily)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Upload vs Download */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={TrendingUp} from="from-violet-500" to="to-purple-600" />
              Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowDown className="w-3.5 h-3.5 text-red-600" />
                  Download
                </span>
                <span className="font-medium text-foreground">
                  {formatMB(downloadTotal)}
                </span>
              </div>
              <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-red-500 rounded-full transition-all duration-700"
                  style={{
                    width: `${downloadTotal + uploadTotal > 0 ? (downloadTotal / (downloadTotal + uploadTotal)) * 100 : 50}%`,
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowUp className="w-3.5 h-3.5 text-red-500" />
                  Upload
                </span>
                <span className="font-medium text-foreground">
                  {formatMB(uploadTotal)}
                </span>
              </div>
              <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 to-red-300 rounded-full transition-all duration-700"
                  style={{
                    width: `${downloadTotal + uploadTotal > 0 ? (uploadTotal / (downloadTotal + uploadTotal)) * 100 : 50}%`,
                  }}
                />
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total This Cycle</span>
              <span className="font-bold text-foreground text-base">
                {formatMB(usage.currentUsed)}
              </span>
            </div>
            {subscriber?.plan?.dataLimitGb && !isUnlimited && (
              <>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Data Limit</span>
                  <span className="font-medium text-foreground">
                    {subscriber.plan.dataLimitGb} GB
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown Chart */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GradientIcon icon={Activity} from="from-slate-400" to="to-slate-500" />
            Daily Usage Breakdown — Last 30 Days
          </CardTitle>
          <CardDescription>
            Hover over bars to see detailed breakdown per day
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usage.dailyUsage.length > 0 ? (
            <DailyUsageChart dailyUsage={usage.dailyUsage} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
              <Activity className="w-8 h-8 mb-2 opacity-40" />
              No daily usage data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade CTA for heavy users */}
      {!isUnlimited && pct >= 90 && (
        <Card className="rounded-xl border-0 bg-gradient-to-r from-red-50 to-red-50 dark:from-red-950/20 dark:to-red-950/20">
          <CardContent className="py-5 px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Zap className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                  Need more data?
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  Upgrade to a higher plan for more data and better speeds.
                </p>
              </div>
            </div>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
              onClick={() => setUpgradeDialogOpen(true)}
            >
              Upgrade Your Plan
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Plan Dialog */}
      <UpgradePlanDialog
        open={upgradeDialogOpen}
        onOpenChange={setUpgradeDialogOpen}
        currentPlanId={subscriber?.plan?.id || ""}
        currentPlanName={subscriber?.plan?.name || "Unknown"}
      />
    </div>
  );
}
