"use client";

// ─── Surfing Quota Policies (POL-ENGINE-1) ────────────────────────
//  time quota per policy — Absolute (fixed hours) or
// Ratebased (postpaid), expiry window, optional cycle reset. Binds to
// Plans. Single page = create + manage combined.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Timer, Trash2, Pencil, Infinity as InfinityIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PolicyPageShell, PolicyFormCard, PolicyTable, EmptyRow, PlanCountBadge,
  EnabledSwitch, Field, RadioRow, usePolicyList, savePolicy, useDeletePolicy, useLocalForm,
} from "./policy-shared";

interface SurfPolicy {
  id: string;
  name: string;
  quotaType: "ABSOLUTE" | "RATEBASED";
  allottedMinutes: number | null;
  sessionPulseMin: number;
  expiryDays: number | null;
  cycleType: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  cycleAllottedMinutes: number | null;
  description: string;
  enabled: boolean;
  planCount?: number;
}

interface FormState {
  name: string;
  quotaType: "ABSOLUTE" | "RATEBASED";
  allottedHours: string;
  sessionPulseMin: string;
  expiryDays: string;
  cycleType: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  cycleAllottedHours: string;
  description: string;
  enabled: boolean;
}

const INITIAL: FormState = {
  name: "", quotaType: "ABSOLUTE", allottedHours: "", sessionPulseMin: "1",
  expiryDays: "", cycleType: "NONE", cycleAllottedHours: "", description: "", enabled: true,
};

const minsToHhmm = (m: number | null) => (m === null ? "Unlimited" : `${Math.floor(m / 60)}h ${m % 60}m`);
const daysLabel = (d: number | null) => (d === null ? "Unlimited" : `${d} day${d > 1 ? "s" : ""}`);

export default function SurfingQuotaPolicyPage() {
  const { policies, isLoading, invalidate } = usePolicyList<SurfPolicy>("/api/policies/surfing-quota", "surfing-quota-policies");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { form, set, setForm } = useLocalForm<FormState>(INITIAL, editingId);
  const { del, busy: delBusy } = useDeletePolicy("/api/policies/surfing-quota", invalidate, "Policy");

  const startEdit = (p: SurfPolicy) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      quotaType: p.quotaType,
      allottedHours: p.allottedMinutes === null ? "" : String(+(p.allottedMinutes / 60).toFixed(2)),
      sessionPulseMin: String(p.sessionPulseMin),
      expiryDays: p.expiryDays === null ? "" : String(p.expiryDays),
      cycleType: p.cycleType,
      cycleAllottedHours: p.cycleAllottedMinutes === null ? "" : String(+(p.cycleAllottedMinutes / 60).toFixed(2)),
      description: p.description || "",
      enabled: p.enabled,
    });
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Policy name is required"); return; }
    setSaving(true);
    try {
      await savePolicy("/api/policies/surfing-quota", editingId ? "PATCH" : "POST", form, editingId || undefined);
      toast.success(editingId ? "Policy updated" : "Policy created");
      setEditingId(null);
      setForm(INITIAL);
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = policies.filter((p) => p.enabled).length;

  return (
    <PolicyPageShell
      title="Surfing Quota Policies"
      subtitle="Time-quota policies — allotted browsing hours, expiry window and optional cycle reset. Bind to plans."
      icon={<Timer className="h-5 w-5" />}
      stats={[
        { label: "Total", value: policies.length },
        { label: "Active", value: activeCount },
        { label: "Bound", value: policies.reduce((s, p) => s + (p.planCount || 0), 0) },
      ]}
      form={
        <PolicyFormCard editing={!!editingId} title={form.name} onClose={() => { setEditingId(null); setForm(INITIAL); }}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Policy Name *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 100 Hours Policy" />
            </Field>
            <div className="md:col-span-1 lg:col-span-2">
              <Field label="Policy Type *">
                <RadioRow
                  value={form.quotaType}
                  onChange={(v) => set("quotaType", v)}
                  options={[
                    { value: "ABSOLUTE", label: "Absolute", hint: "Fixed time quota" },
                    { value: "RATEBASED", label: "Ratebased", hint: "Postpaid, per-minute" },
                  ]}
                />
              </Field>
            </div>
            <Field label="Allotted Time (hours)" hint="Leave blank for unlimited">
              <div className="relative">
                <Input type="number" min="0" step="0.5" value={form.allottedHours} onChange={(e) => set("allottedHours", e.target.value)} placeholder="e.g. 100" />
                {form.allottedHours === "" && <InfinityIcon className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />}
              </div>
            </Field>
            <Field label="Session Pulse (minutes) *" hint="Logout idle check interval">
              <Input type="number" min="1" value={form.sessionPulseMin} onChange={(e) => set("sessionPulseMin", e.target.value)} />
            </Field>
            <Field label="Expiry After (days)" hint="Leave blank for unlimited">
              <Input type="number" min="0" value={form.expiryDays} onChange={(e) => set("expiryDays", e.target.value)} placeholder="e.g. 30" />
            </Field>
            <Field label="Cycle Type">
              <RadioRow
                value={form.cycleType}
                onChange={(v) => set("cycleType", v)}
                options={[
                  { value: "NONE", label: "None" },
                  { value: "DAILY", label: "Daily" },
                  { value: "WEEKLY", label: "Weekly" },
                  { value: "MONTHLY", label: "Monthly" },
                ]}
              />
            </Field>
            <Field label="Cycle Allotted Time (hours)" hint="Time re-granted each cycle">
              <Input type="number" min="0" step="0.5" value={form.cycleAllottedHours} onChange={(e) => set("cycleAllottedHours", e.target.value)} disabled={form.cycleType === "NONE"} placeholder="e.g. 10" />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={1} placeholder="Internal note" />
            </Field>
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t">
            <label className="flex items-center gap-2 text-sm">
              <EnabledSwitch checked={form.enabled} onChange={(v) => set("enabled", v)} /> Policy enabled
            </label>
            <Button onClick={submit} disabled={saving} className="min-w-[120px]">
              {saving ? "Saving…" : editingId ? "Update Policy" : "Create Policy"}
            </Button>
          </div>
        </PolicyFormCard>
      }
      table={
        <PolicyTable
          headers={["Policy Name", "Type", "Time Allowed", "Expiry", "Cycle", "Pulse", "Bound Plans", "Enabled"]}
          isLoading={isLoading}
        >
          <EmptyRow colSpan={9} />
          {policies.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className={p.quotaType === "RATEBASED" ? "text-amber-600 border-amber-500/40" : ""}>{p.quotaType}</Badge>
              </TableCell>
              <TableCell className="tabular-nums">{minsToHhmm(p.allottedMinutes)}</TableCell>
              <TableCell className="tabular-nums">{daysLabel(p.expiryDays)}</TableCell>
              <TableCell>
                {p.cycleType === "NONE" ? <span className="text-muted-foreground text-xs">—</span> : (
                  <span className="text-xs">{p.cycleType} · {minsToHhmm(p.cycleAllottedMinutes)}</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{p.sessionPulseMin}m</TableCell>
              <TableCell><PlanCountBadge count={p.planCount} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2 justify-end">
                  <EnabledSwitch
                    checked={p.enabled}
                    disabled={delBusy === p.id}
                    onChange={async (v) => {
                      try { await savePolicy("/api/policies/surfing-quota", "PATCH", { enabled: v }, p.id); invalidate(); }
                      catch { toast.error("Toggle failed"); }
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled={delBusy === p.id} onClick={() => del(p)} aria-label={`Delete ${p.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </PolicyTable>
      }
    />
  );
}
