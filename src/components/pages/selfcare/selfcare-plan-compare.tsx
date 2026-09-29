"use client";

import React, { useEffect, useState } from "react";
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
import {
  Zap,
  ArrowDownToLine,
  ArrowUpFromLine,
  Star,
  Check,
  RefreshCw,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import type { NavPage } from "./selfcare-layout";

// ─── Types ──────────────────────────────────────────────────

interface PlanCompareProps {
  onNavigate?: (page: NavPage) => void;
}

interface PlanData {
  id: string;
  name: string;
  category: string;
  priceMonthly: number;
  downloadSpeed: number;
  uploadSpeed: number;
  dataLimitGb: number | null;
  pricePerMbps: number;
  pricePerGb: number | null;
  valueScore: number;
  isCurrentPlan: boolean;
  isPopular: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

// ─── Plan Compare Page ───────────────────────────────────────

export default function SelfcarePlanCompare({ onNavigate }: PlanCompareProps) {
  const { subscriber } = useSubscriberAuthStore();
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/selfcare/plan-compare");
      const data = await res.json();
      if (data.success) {
        setPlans(data.data.plans);
        setCurrentPlanId(data.data.currentPlanId);
      } else {
        setError(data.error || "Failed to load plan data");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpgrade = (plan: PlanData) => {
    toast.success("Upgrade Request Submitted", {
      description: `Your request to switch to ${plan.name} (${formatCurrency(plan.priceMonthly)}/mo) has been noted. Our team will contact you shortly.`,
      duration: 5000,
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchData} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="text-center py-16">
        <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-muted-foreground">No plans available for comparison.</p>
      </div>
    );
  }

  const maxScore = Math.max(...plans.map((p) => p.valueScore), 1);
  const features = [
    { key: "price", label: "Monthly Price", render: (p: PlanData) => formatCurrency(p.priceMonthly) },
    { key: "download", label: "Download Speed", render: (p: PlanData) => `${p.downloadSpeed} Mbps` },
    { key: "upload", label: "Upload Speed", render: (p: PlanData) => `${p.uploadSpeed} Mbps` },
    { key: "data", label: "Data Limit", render: (p: PlanData) => p.dataLimitGb ? `${p.dataLimitGb} GB` : "Unlimited" },
    { key: "priceMbps", label: "Price / Mbps", render: (p: PlanData) => formatCurrency(p.pricePerMbps) },
    { key: "priceGb", label: "Price / GB", render: (p: PlanData) => p.pricePerGb ? formatCurrency(p.pricePerGb) : "N/A" },
    { key: "value", label: "Value Score", render: (p: PlanData) => (
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-500 to-amber-500 rounded-full"
            style={{ width: `${(p.valueScore / maxScore) * 100}%` }}
          />
        </div>
        <span className="text-xs">{p.valueScore.toFixed(1)}</span>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Plan Comparison</h2>
          <p className="text-sm text-muted-foreground">
            Compare plans and find the best value for your needs
            {subscriber?.plan?.name && (
              <span> · Current: <span className="font-medium text-red-600">{subscriber.plan.name}</span></span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={fetchData}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Comparison Table */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-xs font-medium text-muted-foreground p-4 w-36">Feature</th>
                {plans.map((plan) => (
                  <th
                    key={plan.id}
                    className={`text-center p-4 min-w-[140px] ${plan.isCurrentPlan ? "bg-red-50/50" : ""}`}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-sm font-bold text-foreground">{plan.name}</span>
                      <div className="flex items-center gap-1.5">
                        {plan.isCurrentPlan && (
                          <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Current</Badge>
                        )}
                        {plan.isPopular && (
                          <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0 flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5" />
                            Popular
                          </Badge>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature, idx) => (
                <tr
                  key={feature.key}
                  className={idx % 2 === 0 ? "bg-muted/20" : ""}
                >
                  <td className="text-sm font-medium text-muted-foreground p-4">{feature.label}</td>
                  {plans.map((plan) => (
                    <td
                      key={plan.id}
                      className={`text-center p-4 text-sm ${plan.isCurrentPlan ? "bg-red-50/50 font-semibold text-foreground" : "text-foreground"}`}
                    >
                      {feature.render(plan)}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Action Row */}
              <tr className="border-t border-border/50">
                <td className="p-4" />
                {plans.map((plan) => (
                  <td key={plan.id} className={`text-center p-4 ${plan.isCurrentPlan ? "bg-red-50/50" : ""}`}>
                    {plan.isCurrentPlan ? (
                      <Badge className="text-xs bg-red-100 text-red-700 border-0 px-3 py-1">
                        <Check className="w-3 h-3 mr-1" />
                        Active Plan
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white border-0 shadow-sm text-xs gap-1"
                        onClick={() => handleUpgrade(plan)}
                      >
                        <Zap className="w-3 h-3" />
                        Request Upgrade
                      </Button>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Plan Cards (mobile-friendly) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`rounded-xl border-2 transition-all duration-200 hover:shadow-md ${
              plan.isCurrentPlan
                ? "border-red-500 shadow-red-100"
                : "border-border/50 ring-1 ring-black/5"
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold">{plan.name}</CardTitle>
                {plan.isCurrentPlan && (
                  <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Current</Badge>
                )}
              </div>
              <CardDescription className="text-xl font-bold text-red-600">
                {formatCurrency(plan.priceMonthly)}
                <span className="text-xs font-normal text-muted-foreground">/mo</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <ArrowDownToLine className="w-4 h-4 text-red-500" />
                <span className="text-foreground font-medium">{plan.downloadSpeed} Mbps</span>
                <span className="text-muted-foreground text-xs">download</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ArrowUpFromLine className="w-4 h-4 text-red-700" />
                <span className="text-foreground font-medium">{plan.uploadSpeed} Mbps</span>
                <span className="text-muted-foreground text-xs">upload</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {plan.dataLimitGb ? `${plan.dataLimitGb} GB data` : "Unlimited data"}
              </div>
              <div className="pt-2">
                {plan.isCurrentPlan ? (
                  <Button className="w-full bg-red-100 text-red-700 hover:bg-red-100 border-0 cursor-default" disabled>
                    <Check className="w-4 h-4 mr-1" />
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white border-0 shadow-sm"
                    onClick={() => handleUpgrade(plan)}
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Request Upgrade
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Need AlertTriangle for error state
function AlertTriangle({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
