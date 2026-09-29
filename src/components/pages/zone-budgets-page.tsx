"use client";

import { useState, useEffect } from "react";
import {
  Wallet, Plus, MapPin, AlertTriangle, TrendingUp, Calendar,
  RefreshCcw, BarChart3, Edit, CheckCircle2, PieChart, Loader2,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────
interface Area {
  id: string;
  name: string;
  code: string;
}

interface BudgetCycle {
  id: string;
  startDate: string;
  endDate: string;
  allotted: number;
  used: number;
  status: "ACTIVE" | "CLOSED" | "PENDING";
}

interface ZoneBudget {
  areaId: string;
  areaName: string;
  totalAllotted: number;
  totalUsed: number;
  remaining: number;
  alertThreshold: number;
  currency: string;
  cycles: BudgetCycle[];
}

interface CreateCycleFormData {
  startDate: string;
  allotted: number;
}

interface UpdateUsageFormData {
  cycleId: string;
  usedAmount: number;
  description: string;
}

const DEMO_AREAS: Area[] = [
  { id: "area-1", name: "Downtown Zone", code: "DT-01" },
  { id: "area-2", name: "Uptown Zone", code: "UT-02" },
  { id: "area-3", name: "Industrial Area", code: "IA-03" },
  { id: "area-4", name: "Residential West", code: "RW-04" },
];

const DEMO_BUDGETS: Record<string, ZoneBudget> = {
  "area-1": { areaId: "area-1", areaName: "Downtown Zone", totalAllotted: 500000, totalUsed: 342500, remaining: 157500, alertThreshold: 80, currency: "INR", cycles: [{ id: "bc-1", startDate: "2025-01-01", endDate: "2025-01-31", allotted: 500000, used: 342500, status: "ACTIVE" }, { id: "bc-2", startDate: "2024-12-01", endDate: "2024-12-31", allotted: 480000, used: 465000, status: "CLOSED" }, { id: "bc-3", startDate: "2024-11-01", endDate: "2024-11-30", allotted: 475000, used: 410000, status: "CLOSED" }] },
  "area-2": { areaId: "area-2", areaName: "Uptown Zone", totalAllotted: 350000, totalUsed: 198000, remaining: 152000, alertThreshold: 75, currency: "INR", cycles: [{ id: "bc-4", startDate: "2025-01-01", endDate: "2025-01-31", allotted: 350000, used: 198000, status: "ACTIVE" }, { id: "bc-5", startDate: "2024-12-01", endDate: "2024-12-31", allotted: 340000, used: 338000, status: "CLOSED" }] },
  "area-3": { areaId: "area-3", areaName: "Industrial Area", totalAllotted: 200000, totalUsed: 68000, remaining: 132000, alertThreshold: 70, currency: "INR", cycles: [{ id: "bc-6", startDate: "2025-01-01", endDate: "2025-01-31", allotted: 200000, used: 68000, status: "ACTIVE" }] },
  "area-4": { areaId: "area-4", areaName: "Residential West", totalAllotted: 280000, totalUsed: 250000, remaining: 30000, alertThreshold: 80, currency: "INR", cycles: [{ id: "bc-7", startDate: "2025-01-01", endDate: "2025-01-31", allotted: 280000, used: 250000, status: "ACTIVE" }, { id: "bc-8", startDate: "2024-12-01", endDate: "2024-12-31", allotted: 270000, used: 268000, status: "CLOSED" }] },
};

// ─── Helpers ────────────────────────────────────────────────────
function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return "text-red-600 dark:text-red-400";
  if (percent >= 75) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

function getProgressClass(percent: number): string {
  if (percent >= 90) return "[&>div]:bg-red-500";
  if (percent >= 75) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-green-500";
}

function getCycleStatusBadge(status: string) {
  switch (status) {
    case "ACTIVE": return <Badge className="text-[10px] bg-green-600 hover:bg-green-700 text-white">Active</Badge>;
    case "CLOSED": return <Badge variant="secondary" className="text-[10px]">Closed</Badge>;
    case "PENDING": return <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">Pending</Badge>;
    default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  }
}

// ─── Component ────────────────────────────────────────────────────
export default function ZoneBudgetsPage() {
  const [selectedArea, setSelectedArea] = useState("area-1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Record<string, ZoneBudget>>(DEMO_BUDGETS);

  // Dialogs
  const [createCycleOpen, setCreateCycleOpen] = useState(false);
  const [updateUsageOpen, setUpdateUsageOpen] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [cycleForm, setCycleForm] = useState<CreateCycleFormData>({ startDate: "", allotted: 0 });
  const [usageForm, setUsageForm] = useState<UpdateUsageFormData>({ cycleId: "", usedAmount: 0, description: "" });

  // ─── Data Fetching ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/area-budgets`);
        if (!res.ok) throw new Error("Failed to fetch zone budgets");
        const data = await res.json();
        if (data && typeof data === "object" && !Array.isArray(data)) {
          setBudgets(data);
        } else {
          setBudgets(DEMO_BUDGETS);
        }
      } catch (err) {
        // logger
        setError(err instanceof Error ? err.message : "Unknown error");
        setBudgets(DEMO_BUDGETS);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const currentBudget = budgets[selectedArea];
  const usagePercent = currentBudget ? Math.round((currentBudget.totalUsed / currentBudget.totalAllotted) * 100) : 0;
  const isOverThreshold = usagePercent >= currentBudget?.alertThreshold;

  // Aggregate stats across all areas
  const totalAllotted = Object.values(budgets).reduce((s, b) => s + b.totalAllotted, 0);
  const totalUsed = Object.values(budgets).reduce((s, b) => s + b.totalUsed, 0);
  const totalRemaining = Object.values(budgets).reduce((s, b) => s + b.remaining, 0);

  async function handleCreateCycle() {
    if (!cycleForm.startDate) { toast.error("Start date is required"); return; }
    if (cycleForm.allotted <= 0) { toast.error("Budget amount must be greater than zero"); return; }
    if (cycleForm.allotted < 1000) { toast.error("Budget must be at least ₹1,000"); return; }
    setSubmitting(true);
    try {
      await fetch(`/api/area-budgets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ areaId: selectedArea, ...cycleForm }) });
      setCreateCycleOpen(false);
      setCycleForm({ startDate: "", allotted: 0 });
      toast.success("Budget cycle created successfully");
    } catch {
      toast.error("Failed to create cycle");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateUsage() {
    if (usageForm.usedAmount < 0) { toast.error("Usage amount must be positive"); return; }
    setSubmitting(true);
    try {
      await fetch(`/api/area-budgets`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(usageForm) });
      setUpdateUsageOpen(false);
      setUsageForm({ cycleId: "", usedAmount: 0, description: "" });
      setSelectedCycleId(null);
      toast.success("Usage updated successfully");
    } catch {
      toast.error("Failed to update usage");
    } finally {
      setSubmitting(false);
    }
  }

  function openUpdateUsage(cycleId: string, currentUsed: number) {
    setSelectedCycleId(cycleId);
    setUsageForm({ cycleId, usedAmount: currentUsed, description: "" });
    setUpdateUsageOpen(true);
  }

  if (!currentBudget) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <PageHeader title="Zone Budgets" description="Budget management for operational zones." icon={Wallet} />
        <Card className="border shadow-sm"><CardContent className="p-12 text-center text-muted-foreground">No budget data available for the selected area.</CardContent></Card>
      </div>
    );
  }

  const activeCycle = currentBudget.cycles.find((c) => c.status === "ACTIVE");

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Zone Budgets"
        description="Manage operational budgets by area with cycle tracking and threshold alerts."
        icon={Wallet}
        actions={
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setCreateCycleOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Create Cycle
          </Button>
        }
      />

      {/* Error Banner */}
      {error && (
        <Card className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">Showing demo data — API unavailable: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Area Selector */}
      <div className="flex flex-wrap gap-2">
        {DEMO_AREAS.map((area) => {
          const budget = budgets[area.id];
          const pct = budget ? Math.round((budget.totalUsed / budget.totalAllotted) * 100) : 0;
          return (
            <Button
              key={area.id}
              variant={selectedArea === area.id ? "default" : "outline"}
              size="sm"
              className={selectedArea === area.id ? "bg-red-600 hover:bg-red-700 text-white" : ""}
              onClick={() => setSelectedArea(area.id)}
            >
              <MapPin className="h-3.5 w-3.5 mr-1.5" />
              {area.name}
              <Badge variant="outline" className={`text-[9px] ml-1.5 ${pct >= 90 ? "border-red-300 text-red-600" : pct >= 75 ? "border-amber-300 text-amber-600" : "border-green-300 text-green-600"}`}>
                {pct}%
              </Badge>
            </Button>
          );
        })}
      </div>

      {/* Budget Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <>
            <Card className="border shadow-sm md:col-span-2"><CardContent className="p-6"><Skeleton className="h-48 w-full rounded-lg" /></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-6"><Skeleton className="h-48 w-full rounded-lg" /></CardContent></Card>
          </>
        ) : (
          <>
            {/* Main Budget Card */}
            <Card className="border shadow-sm md:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-red-600" />
                      {currentBudget.areaName} — Current Cycle
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {activeCycle?.startDate} to {activeCycle?.endDate}
                    </CardDescription>
                  </div>
                  <div className={`text-right ${isOverThreshold ? "text-red-600" : "text-muted-foreground"}`}>
                    {isOverThreshold && <AlertTriangle className="h-4 w-4 mx-auto mb-1" />}
                    <span className="text-xs font-medium">{isOverThreshold ? "Over Threshold" : "Within Budget"}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Allotted</p>
                    <p className="text-lg font-bold tabular-nums">{formatINR(currentBudget.totalAllotted)}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Used</p>
                    <p className={`text-lg font-bold tabular-nums ${getUsageColor(usagePercent)}`}>{formatINR(currentBudget.totalUsed)}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Remaining</p>
                    <p className="text-lg font-bold tabular-nums">{formatINR(currentBudget.remaining)}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Usage</span>
                    <span className={`font-semibold ${getUsageColor(usagePercent)}`}>{usagePercent}%</span>
                  </div>
                  <Progress value={usagePercent} className={`h-3 ${getProgressClass(usagePercent)}`} />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>₹0</span>
                    <span>Alert at {currentBudget.alertThreshold}%</span>
                    <span>{formatINR(currentBudget.totalAllotted)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Card */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                  All Areas Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Total Allotted</span>
                    <span className="font-semibold tabular-nums">{formatINR(totalAllotted)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Total Used</span>
                    <span className={`font-semibold tabular-nums ${getUsageColor(Math.round((totalUsed / totalAllotted) * 100))}`}>{formatINR(totalUsed)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Total Remaining</span>
                    <span className="font-semibold tabular-nums">{formatINR(totalRemaining)}</span>
                  </div>
                  <div className="h-px bg-border my-1" />
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Alert Threshold</span>
                    <Badge variant={isOverThreshold ? "destructive" : "outline"} className="text-[10px]">
                      {currentBudget.alertThreshold}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Budget Status</span>
                    <Badge variant={isOverThreshold ? "destructive" : "outline"} className="text-[10px]">
                      {isOverThreshold ? "Over Threshold" : "Healthy"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Budget Cycles Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Budget Cycles — {currentBudget.areaName}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Start Date</TableHead>
                  <TableHead className="text-xs">End Date</TableHead>
                  <TableHead className="text-xs">Allotted</TableHead>
                  <TableHead className="text-xs">Used</TableHead>
                  <TableHead className="text-xs">Usage %</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentBudget.cycles.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No budget cycles found.</TableCell></TableRow>
                ) : (
                  currentBudget.cycles.map((cycle) => {
                    const cyclePercent = Math.round((cycle.used / cycle.allotted) * 100);
                    return (
                      <TableRow key={cycle.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="text-xs font-medium">{new Date(cycle.startDate).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(cycle.endDate).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs font-medium tabular-nums">{formatINR(cycle.allotted)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{formatINR(cycle.used)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={cyclePercent} className={`h-2 w-16 ${getProgressClass(cyclePercent)}`} />
                            <span className={`text-xs font-medium tabular-nums ${getUsageColor(cyclePercent)}`}>{cyclePercent}%</span>
                          </div>
                        </TableCell>
                        <TableCell>{getCycleStatusBadge(cycle.status)}</TableCell>
                        <TableCell className="text-right">
                          {cycle.status === "ACTIVE" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => openUpdateUsage(cycle.id, cycle.used)}>
                              <Edit className="h-3.5 w-3.5 mr-1" />Update Usage
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Cycle Dialog */}
      <Dialog open={createCycleOpen} onOpenChange={setCreateCycleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Create Budget Cycle</DialogTitle>
            <DialogDescription>Create a new budget cycle for {currentBudget.areaName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={cycleForm.startDate} onChange={(e) => setCycleForm((p) => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Budget Amount (₹)</Label>
              <Input type="number" min={1000} step={1000} value={cycleForm.allotted} onChange={(e) => setCycleForm((p) => ({ ...p, allotted: parseInt(e.target.value) || 0 }))} placeholder="e.g. 500000" />
              <p className="text-[10px] text-muted-foreground">Enter the total allotted budget for this cycle</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCycleOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCreateCycle} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Create Cycle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Usage Dialog */}
      <Dialog open={updateUsageOpen} onOpenChange={setUpdateUsageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5" />Update Usage</DialogTitle>
            <DialogDescription>Update the used amount for the selected budget cycle.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Used Amount (₹)</Label>
              <Input type="number" min={0} step={1000} value={usageForm.usedAmount} onChange={(e) => setUsageForm((p) => ({ ...p, usedAmount: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input placeholder="e.g. Fiber cable purchase for DT-01 area" value={usageForm.description} onChange={(e) => setUsageForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateUsageOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleUpdateUsage} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
