"use client";

// ─── Plan Policy Binding tab (POL-ENGINE-1) ───────────────────────
// 24online-parity: each plan binds ≤1 policy per family (Surfing
// Quota, Access Time, Bandwidth, Data Transfer, Fair Access).

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Link2, Save, Timer, CalendarClock, Gauge, ArrowDownUp, Hourglass, Loader2 } from "lucide-react";

interface PolicyOpt { id: string; name: string; enabled?: boolean }
interface PlanRow {
  id: string; name: string; category: string;
  surfingQuotaPolicyId?: string | null;
  accessTimePolicyId?: string | null;
  bandwidthPolicyId?: string | null;
  dataTransferPolicyId?: string | null;
  fairAccessPolicyId?: string | null;
}

const FAMILIES = [
  { key: "surfingQuotaPolicyId", label: "Surfing Quota Policy", icon: Timer, endpoint: "/api/policies/surfing-quota", hint: "Allotted browsing hours + expiry" },
  { key: "accessTimePolicyId", label: "Access Time Policy", icon: CalendarClock, endpoint: "/api/policies/access-time", hint: "Allowed hours per weekday" },
  { key: "bandwidthPolicyId", label: "Bandwidth Policy", icon: Gauge, endpoint: "/api/policies/bandwidth", hint: "Speed cap applied to the plan" },
  { key: "dataTransferPolicyId", label: "Data Transfer Policy", icon: ArrowDownUp, endpoint: "/api/policies/data-transfer", hint: "Volume quota / postpaid rates" },
  { key: "fairAccessPolicyId", label: "Fair Access Policy", icon: Hourglass, endpoint: "/api/policies/fair-access", hint: "Throttle after data limit (optional)" },
] as const;

function FamilyCard({ family, value, onChange, disabled }: { family: (typeof FAMILIES)[number]; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: [`${family.key}-options`],
    queryFn: () => apiFetch<{ policies: PolicyOpt[] }>(family.endpoint),
  });
  const opts = (data?.policies || []).filter((p: PolicyOpt) => p.enabled !== false);
  const Icon = family.icon;
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {family.label}
        </div>
        {value && <Badge variant="outline" className="text-[10px] bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">bound</Badge>}
      </div>
      <Select value={value || "none"} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-9"><SelectValue placeholder="No policy selected" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No policy selected</SelectItem>
          {opts.map((p: PolicyOpt) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">{isLoading ? "Loading…" : family.hint}</p>
    </div>
  );
}

export default function PlanPolicyBindingTab() {
  const qc = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["plans-for-policies"],
    queryFn: () => apiFetch<{ items: PlanRow[] }>("/api/plans?limit=100"),
  });



  const plans = plansData?.items || [];
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  useEffect(() => {
    if (!selectedPlanId && plans.length) setSelectedPlanId(plans[0].id);
  }, [plans, selectedPlanId]);

  useEffect(() => {
    if (selectedPlan) {
      setBindings({
        surfingQuotaPolicyId: selectedPlan.surfingQuotaPolicyId || "",
        accessTimePolicyId: selectedPlan.accessTimePolicyId || "",
        bandwidthPolicyId: selectedPlan.bandwidthPolicyId || "",
        dataTransferPolicyId: selectedPlan.dataTransferPolicyId || "",
        fairAccessPolicyId: selectedPlan.fairAccessPolicyId || "",
      });
      setDirty(false);
    }
  }, [selectedPlan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!selectedPlanId) return;
    setSaving(true);
    try {
      await apiFetch(`/api/plans/${selectedPlanId}`, { method: "PUT", body: JSON.stringify(bindings) });
      toast.success("Policy bindings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["plans-for-policies"] });
      qc.invalidateQueries({ queryKey: ["plans"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const boundCount = Object.values(bindings).filter(Boolean).length;

  return (
    <div className="space-y-4 max-w-[1000px]">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-emerald-500" />
            Plan → Policy Binding
          </CardTitle>
          <CardDescription>
            Map each policy family to a plan, exactly like 24online packages. A plan can have one policy per family.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Select Plan</Label>
              <Select value={selectedPlanId} onValueChange={(v) => { setSelectedPlanId(v); }}>
                <SelectTrigger className="w-full sm:w-[320px]"><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={save} disabled={saving || !selectedPlanId || !dirty} className="gap-2 min-w-[140px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : dirty ? `Save ${boundCount} binding(s)` : "Saved"}
            </Button>
          </div>

          {plansLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {FAMILIES.map((family) => (
                <FamilyCard
                  key={family.key}
                  family={family}
                  value={bindings[family.key] || ""}
                  onChange={(v) => { setBindings((b) => ({ ...b, [family.key]: v === "none" ? "" : v })); setDirty(true); }}
                  disabled={!selectedPlanId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
