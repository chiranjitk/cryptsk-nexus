"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ChevronRight, DollarSign } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────

interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  subscriber: {
    id: string;
    name: string;
    code: string;
    phone: string;
    area: { id: string; name: string } | null;
  };
  plan: { id: string; name: string } | null;
  grandTotal: number;
  balanceAmount: number;
  dueDate: string;
  status: string;
}

interface OverdueResponse {
  invoices: OverdueInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  statusCounts: Record<string, number>;
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
}

// ─── Color Helpers ──────────────────────────────────────

function overdueColor(daysOverdue: number) {
  if (daysOverdue > 30) return { text: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-950/40", border: "border-l-red-600 dark:border-l-red-500", label: "bg-red-100 text-red-700 border-red-200" };
  if (daysOverdue >= 15) return { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/40", border: "border-l-amber-500 dark:border-l-amber-400", label: "bg-amber-100 text-amber-700 border-amber-200" };
  return { text: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-950/40", border: "border-l-yellow-500 dark:border-l-yellow-400", label: "bg-yellow-100 text-yellow-700 border-yellow-200" };
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function daysBetween(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// ─── Overdue Payments Widget ────────────────────────────

export function OverduePaymentsWidget() {
  const [data, setData] = useState<OverdueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      else setIsRefetching(true);

      try {
        const res = await fetch(
          "/api/invoices?status=OVERDUE&limit=10&sortBy=dueDate&sortOrder=asc",
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("Failed to fetch overdue invoices");
        const json: OverdueResponse = await res.json();
        setData(json);
      } catch (err) {
        console.error("Overdue Payments Widget fetch error:", err);
      } finally {
        setIsLoading(false);
        setIsRefetching(false);
      }
    },
    []
  );

  // Initial fetch + auto-refresh every 120 seconds
  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 120000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const handleViewAll = () => {
    setCurrentPage("Invoices", "FINANCE");
  };

  // ── Loading Skeleton ──
  if (isLoading) {
    return (
      <Card className="border shadow-sm rounded-xl animate-card-enter">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <Skeleton className="h-10 rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Empty / No data ──
  if (!data) return null;

  const displayed = data.invoices.slice(0, 5);
  const totalOverdueAmount = data.invoices.reduce(
    (sum, inv) => sum + (inv.balanceAmount || inv.grandTotal),
    0
  );

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200">
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            Overdue Payments
            {data.total > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  data.total > 5
                    ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                    : "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                )}
              >
                {data.total}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(false)}
            disabled={isRefetching}
            aria-label="Refresh overdue payments"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* ── Summary bar ── */}
        <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Total Overdue</span>
          </div>
          <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
            {formatINR(totalOverdueAmount)}
          </span>
        </div>

        {/* ── List ── */}
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-950/40 mb-2">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-medium">No overdue payments</p>
            <p className="text-[10px] mt-0.5">All invoices are paid on time</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1.5">
            {displayed.map((inv) => {
              const daysOverdue = daysBetween(inv.dueDate);
              const color = overdueColor(daysOverdue);
              return (
                <div
                  key={inv.id}
                  className={cn(
                    "rounded-md border border-border/50 border-l-[3px] p-2.5",
                    "hover:bg-muted/50 transition-colors",
                    color.border
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {inv.subscriber?.name || "Unknown"}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-bold px-1.5 py-0 h-4 rounded shrink-0",
                            color.label
                          )}
                        >
                          {daysOverdue}d overdue
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                        <span className="font-medium tabular-nums">{inv.invoiceNumber}</span>
                        <span className="shrink-0">·</span>
                        <span className="truncate">{inv.plan?.name || "N/A"}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        Due: {formatShortDate(inv.dueDate)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        {formatINR(inv.balanceAmount || inv.grandTotal)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">outstanding</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── View All link ── */}
        {data.total > 5 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={handleViewAll}
          >
            View all {data.total} overdue
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* ── Auto-refresh indicator ── */}
        <p className="text-[10px] text-muted-foreground/60 text-right">
          Auto-refreshes every 120s
        </p>
      </CardContent>
    </Card>
  );
}
