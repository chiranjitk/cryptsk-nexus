"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  RotateCcw, Search, RefreshCw, Gauge, Plus,
  ArrowDown, ArrowUp, User,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────
interface BillingMilestone {
  id: string;
  name?: string;
  thresholdGb: number;
  speedDownKbps: number;
  speedUpKbps: number;
  priority: number;
  description?: string | null;
}

interface BillingCycle {
  id: string;
  subscriberId: string;
  subscriberName: string | null;
  subscriberCode: string | null;
  planName: string | null;
  cycleStart: string;
  cycleEnd: string;
  dataUsedGb: number;
  dataAllottedGb: number;
  currentSpeedDownKbps: number;
  currentSpeedUpKbps: number;
  currentMilestone: string | null;
  status: "ACTIVE" | "COMPLETED" | "RESET";
  nextResetAt: string | null;
}

interface Plan {
  id: string;
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  dataLimitGb: number | null;
}

// ─── Component ────────────────────────────────────────────────────
export default function CyclicBillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [milestones, setMilestones] = useState<BillingMilestone[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);

  const [cycles, setCycle] = useState<BillingCycle[]>([]);
  const [subSearch, setSubSearch] = useState("");
  const [loadingCycles, setLoadingCycles] = useState(false);

  // ─── Milestone creation ───
  const [msDialog, setMsDialog] = useState(false);
  const [msForm, setMsForm] = useState({ name: "", thresholdGb: "", speedDownMbps: "", speedUpMbps: "", priority: "0" });
  const [savingMilestone, setSavingMilestone] = useState(false);

  async function createMilestone() {
    if (!selectedPlanId) { toast.error("Select a plan first"); return; }
    if (!msForm.name.trim() || !msForm.thresholdGb) { toast.error("Milestone name and threshold are required"); return; }
    setSavingMilestone(true);
    try {
      // UI speaks GB/Mbps — storage columns are Mb/Kbps (documented units)
      await apiFetch("/api/cyclic-billing?action=create-milestone", {
        method: "POST",
        body: JSON.stringify({
          planId: selectedPlanId,
          name: msForm.name.trim(),
          thresholdDataMb: Math.round(parseFloat(msForm.thresholdGb) * 1024),
          speedDownKbps: Math.round(parseFloat(msForm.speedDownMbps || "0") * 1000),
          speedUpKbps: Math.round(parseFloat(msForm.speedUpMbps || "0") * 1000),
          priority: parseInt(msForm.priority || "0"),
          enabled: true,
        }),
      });
      toast.success(`Milestone "${msForm.name.trim()}" added`);
      setMsDialog(false);
      setMsForm({ name: "", thresholdGb: "", speedDownMbps: "", speedUpMbps: "", priority: "0" });
      fetchMilestones(selectedPlanId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create milestone");
    } finally {
      setSavingMilestone(false);
    }
  }

  const [loadingPlans, setLoadingPlans] = useState(true);

  // ─── Fetch plans ───
  const fetchPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      // GET /api/plans returns { items, total, … } (not { plans })
      const data = await apiFetch<{ items: Plan[] }>("/api/plans?limit=100");
      setPlans(data.items || []);
    } catch {
      toast.error("Failed to load plans");
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // ─── Fetch milestones for plan ───
  const fetchMilestones = useCallback(async (planId: string) => {
    if (!planId) return;
    setLoadingMilestones(true);
    try {
      // The API exposes actions on the single /api/cyclic-billing route
      // (milestones/cycles subpaths 404) — query with ?action=list-milestones.
      const data = await apiFetch<{ milestones: BillingMilestone[] }>(`/api/cyclic-billing?action=list-milestones&planId=${planId}`);
      setMilestones(data.milestones || []);
    } catch {
      toast.error("Failed to load billing milestones");
    } finally {
      setLoadingMilestones(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlanId) fetchMilestones(selectedPlanId);
  }, [selectedPlanId, fetchMilestones]);

  // ─── Search subscriber cycles ───
  async function searchCycles() {
    if (!subSearch.trim()) {
      toast.error("Enter a subscriber code or name to search");
      return;
    }
    setLoadingCycles(true);
    try {
      const data = await apiFetch<{ cycles: BillingCycle[] }>(
        `/api/cyclic-billing?action=list-cycles&search=${encodeURIComponent(subSearch)}`
      );
      setCycle(data.cycles || []);
    } catch {
      toast.error("Failed to search billing cycles");
      setCycle([]);
    } finally {
      setLoadingCycles(false);
    }
  }

  // ─── Helpers ───
  // Milestone speeds are stored in Kbps (field name documents the unit).
  function formatSpeed(kbps: number): string {
    if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
    return `${kbps} Kbps`;
  }
  // Plan speeds are stored in Mbps since the unit migration — render directly.
  const formatPlanSpeed = (mbps: number) => `${mbps} Mbps`;

  function cycleStatusBadge(status: string) {
    const map: Record<string, { label: string; cls: string }> = {
      ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
      COMPLETED: { label: "Completed", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400" },
      RESET: { label: "Reset", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
    };
    const entry = map[status] || { label: status, cls: "" };
    return <Badge className={`${entry.cls} text-[10px]`}>{entry.label}</Badge>;
  }

  // ─── Loading ───
  if (loadingPlans) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <Skeleton className="skeleton-wave h-64 rounded-lg" />
      </div>
    );
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="Cyclic Billing"
        description="Configure usage-based billing milestones and monitor active billing cycles with bandwidth throttling."
        icon={RotateCcw}
        actions={
          <Button variant="outline" onClick={() => { fetchPlans(); if (selectedPlanId) fetchMilestones(selectedPlanId); }}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        }
      />

      {/* ─── Section 1: Billing Milestones ─── */}
      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                Billing Milestones
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Define bandwidth throttling thresholds for data usage cycles.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px] text-muted-foreground">Select Plan</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="w-[220px] h-8 text-xs">
                    <SelectValue placeholder="Choose a plan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                        {plan.dataLimitGb ? ` (${plan.dataLimitGb} GB)` : " (Unlimited)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="mt-4" disabled={!selectedPlanId} onClick={() => setMsDialog(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add Milestone
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedPlanId ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Select a plan above to view and configure billing milestones.
            </div>
          ) : loadingMilestones ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : milestones.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm mb-3">No milestones configured for {selectedPlan?.name}.</p>
              <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => setMsDialog(true)}>
                <Gauge className="h-4 w-4 mr-2" />Add First Milestone
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Plan info bar */}
              {selectedPlan && (
                <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-muted/30 border text-xs mb-2">
                  <span className="font-medium">{selectedPlan.name}</span>
                  <span className="text-muted-foreground">Base: ↓{formatPlanSpeed(selectedPlan.downloadSpeed)} / ↑{formatPlanSpeed(selectedPlan.uploadSpeed)}</span>
                  {selectedPlan.dataLimitGb ? (
                    <Badge variant="outline" className="text-[10px]">{selectedPlan.dataLimitGb} GB / cycle</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Unlimited</Badge>
                  )}
                  <span className="text-muted-foreground">{milestones.length} milestone{milestones.length !== 1 ? "s" : ""}</span>
                </div>
              )}

              {/* Milestones table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-10">#</TableHead>
                      <TableHead className="text-xs">Threshold</TableHead>
                      <TableHead className="text-xs">Speed Down</TableHead>
                      <TableHead className="text-xs">Speed Up</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Priority</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {milestones.map((milestone, idx) => (
                      <TableRow key={milestone.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Gauge className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-sm font-semibold">{milestone.thresholdGb} GB</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            <ArrowDown className="h-3 w-3 text-green-600" />
                            <span className="tabular-nums">{formatSpeed(milestone.speedDownKbps)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            <ArrowUp className="h-3 w-3 text-teal-600" />
                            <span className="tabular-nums">{formatSpeed(milestone.speedUpKbps)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums hidden md:table-cell">{milestone.priority}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{milestone.description || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Visual flow */}
              <div className="p-4 border rounded-lg bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Speed Throttling Flow</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedPlan && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 text-[11px] font-medium">
                      <Gauge className="h-3 w-3" />
                      0 GB — {formatPlanSpeed(selectedPlan.downloadSpeed)}
                    </div>
                  )}
                  {milestones.sort((a, b) => a.thresholdGb - b.thresholdGb).map((ms, idx) => (
                    <div key={ms.id} className="flex items-center gap-1">
                      <ArrowUp className="h-3 w-3 text-muted-foreground rotate-90" />
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                        <Gauge className="h-3 w-3" />
                        {ms.thresholdGb} GB — {formatSpeed(ms.speedDownKbps)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 2: Active Cycles ─── */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            Active Billing Cycles
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Search for a subscriber to view their current billing cycle status and usage progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search subscriber by name or code..."
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchCycles()}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={searchCycles} disabled={loadingCycles}>
              <Search className="h-4 w-4 mr-2" />Search
            </Button>
          </div>

          {loadingCycles ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
            </div>
          ) : cycles.length === 0 && subSearch ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No billing cycles found for this subscriber.
            </div>
          ) : cycles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Search for a subscriber to view their billing cycle information.
            </div>
          ) : (
            <div className="grid gap-4">
              {cycles.map((cycle) => {
                const usagePercent = cycle.dataAllottedGb > 0
                  ? Math.min((cycle.dataUsedGb / cycle.dataAllottedGb) * 100, 100)
                  : 0;

                const progressColor =
                  usagePercent >= 90 ? "bg-red-500" :
                  usagePercent >= 70 ? "bg-amber-500" :
                  "bg-emerald-500";

                return (
                  <div key={cycle.id} className="border rounded-lg p-4 space-y-3">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 shadow-sm">
                          <User className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{cycle.subscriberName}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{cycle.subscriberCode} · {cycle.planName}</div>
                        </div>
                      </div>
                      {cycleStatusBadge(cycle.status)}
                    </div>

                    {/* Usage progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Data Usage</span>
                        <span className="font-medium tabular-nums">
                          {cycle.dataUsedGb.toFixed(2)} GB / {cycle.dataAllottedGb} GB
                          <span className="text-muted-foreground ml-2">({usagePercent.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Cycle details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground">Cycle Period</span>
                        <div className="font-medium">
                          {new Date(cycle.cycleStart).toLocaleDateString()} — {new Date(cycle.cycleEnd).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground">Current Speed</span>
                        <div className="font-medium">
                          {cycle.currentSpeedDownKbps > 0 ? (
                            <>
                              <span className="text-green-600">↓{formatSpeed(cycle.currentSpeedDownKbps)}</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className="text-teal-600">↑{formatSpeed(cycle.currentSpeedUpKbps)}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground">Active Milestone</span>
                        <div className="font-medium">
                          {cycle.currentMilestone ? (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">{cycle.currentMilestone}</Badge>
                          ) : (
                            <span className="text-emerald-600">Base speed</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground">Next Reset</span>
                        <div className="font-medium">
                          {cycle.nextResetAt ? new Date(cycle.nextResetAt).toLocaleDateString() : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Add Milestone Dialog ─── */}
      <Dialog open={msDialog} onOpenChange={setMsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4 text-amber-600" />Add Milestone</DialogTitle>
            <DialogDescription className="text-xs">
              When the subscriber crosses the data threshold in a cycle, their speed is throttled to the milestone values until the next reset.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3.5 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Milestone Name</Label>
              <Input value={msForm.name} onChange={(e) => setMsForm({ ...msForm, name: e.target.value })} placeholder="e.g. Fair Usage Limit" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data Threshold (GB)</Label>
                <Input type="number" min="0" value={msForm.thresholdGb} onChange={(e) => setMsForm({ ...msForm, thresholdGb: e.target.value })} placeholder="100" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Input type="number" min="0" value={msForm.priority} onChange={(e) => setMsForm({ ...msForm, priority: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><ArrowDown className="h-3 w-3 text-green-600" />Throttle Down (Mbps)</Label>
                <Input type="number" min="0" value={msForm.speedDownMbps} onChange={(e) => setMsForm({ ...msForm, speedDownMbps: e.target.value })} placeholder="5" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><ArrowUp className="h-3 w-3 text-teal-600" />Throttle Up (Mbps)</Label>
                <Input type="number" min="0" value={msForm.speedUpMbps} onChange={(e) => setMsForm({ ...msForm, speedUpMbps: e.target.value })} placeholder="2" />
              </div>
            </div>
            {selectedPlan && (
              <p className="text-[11px] text-muted-foreground">
                Plan base speed: ↓{formatPlanSpeed(selectedPlan.downloadSpeed)} / ↑{formatPlanSpeed(selectedPlan.uploadSpeed)} — throttled values should be lower.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsDialog(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={createMilestone} disabled={savingMilestone}>
              {savingMilestone ? "Saving…" : "Add Milestone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
