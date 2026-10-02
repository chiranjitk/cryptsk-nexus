"use client";

// ─── Access Time Policies (POL-ENGINE-1) ──────────────────────────
// 24online-parity: weekday time slots; during a slot a member is
// either disallowed or gets a pricing factor; the default strategy
// applies outside all slots. Single page = create + manage combined.

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Trash2, Pencil, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PolicyPageShell, PolicyFormCard, PolicyTable, EmptyRow, PlanCountBadge,
  EnabledSwitch, Field, RadioRow, usePolicyList, savePolicy, useDeletePolicy, useLocalForm, DAY_NAMES,
} from "./policy-shared";

interface Slot {
  dayOfWeek: number;
  from: string;
  till: string;
  pricingFactorPct: string; // "" = disallow
}

interface AccPolicy {
  id: string;
  name: string;
  defaultStrategy: "ALLOW" | "DISALLOW";
  description: string;
  enabled: boolean;
  planCount?: number;
  slots: Slot[];
}

interface FormState {
  name: string;
  defaultStrategy: "ALLOW" | "DISALLOW";
  description: string;
  enabled: boolean;
  slots: Slot[];
}

const INITIAL: FormState = { name: "", defaultStrategy: "ALLOW", description: "", enabled: true, slots: [] };

export default function AccessTimePolicyPage() {
  const { policies, isLoading, invalidate } = usePolicyList<AccPolicy>("/api/policies/access-time", "access-time-policies");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { form, set, setForm } = useLocalForm<FormState>(INITIAL, editingId);
  const { del, busy: delBusy } = useDeletePolicy("/api/policies/access-time", invalidate, "Policy");

  const startEdit = (p: AccPolicy) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      defaultStrategy: p.defaultStrategy,
      description: p.description || "",
      enabled: p.enabled,
      slots: (p.slots || []).map((s) => ({
        dayOfWeek: s.dayOfWeek,
        from: s.from?.slice(0, 5) || "09:00",
        till: s.till?.slice(0, 5) || "21:00",
        pricingFactorPct: s.pricingFactorPct === null || s.pricingFactorPct === undefined ? "" : String(s.pricingFactorPct),
      })),
    });
  };

  const addSlot = () => set("slots", [...form.slots, { dayOfWeek: 1, from: "09:00", till: "21:00", pricingFactorPct: "" }]);
  const updSlot = (i: number, patch: Partial<Slot>) => {
    const next = form.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    set("slots", next);
  };
  const rmSlot = (i: number) => set("slots", form.slots.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Policy name is required"); return; }
    for (const s of form.slots) {
      if (s.from >= s.till) { toast.error(`Invalid slot: ${DAY_NAMES[s.dayOfWeek]} ${s.from}–${s.till} (end must be after start)`); return; }
      if (s.pricingFactorPct !== "" && (Number(s.pricingFactorPct) < 0 || Number(s.pricingFactorPct) > 500)) {
        toast.error("Pricing factor must be 0–500%");
        return;
      }
    }
    setSaving(true);
    try {
      await savePolicy("/api/policies/access-time", editingId ? "PATCH" : "POST", form, editingId || undefined);
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

  const totalSlots = policies.reduce((s, p) => s + (p.slots?.length || 0), 0);

  return (
    <PolicyPageShell
      title="Access Time Policies"
      subtitle="Weekday time slots — disallow login or apply a pricing factor during the slot; default strategy applies outside."
      icon={<CalendarClock className="h-5 w-5" />}
      stats={[
        { label: "Total", value: policies.length },
        { label: "Slots", value: totalSlots },
        { label: "Bound", value: policies.reduce((s, p) => s + (p.planCount || 0), 0) },
      ]}
      form={
        <PolicyFormCard editing={!!editingId} title={form.name} onClose={() => { setEditingId(null); setForm(INITIAL); }}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Policy Name *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Night hours only" />
            </Field>
            <div className="lg:col-span-2">
              <Field label="Default Strategy *" hint="Applied outside all defined slots">
                <RadioRow
                  value={form.defaultStrategy}
                  onChange={(v) => set("defaultStrategy", v)}
                  options={[
                    { value: "ALLOW", label: "Allow", hint: "Free to surf outside slots" },
                    { value: "DISALLOW", label: "Disallow", hint: "Blocked outside slots" },
                  ]}
                />
              </Field>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Time Slots ({form.slots.length})</span>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addSlot}>
                <Plus className="h-3 w-3" /> Add Slot
              </Button>
            </div>
            {form.slots.length === 0 && (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground text-center">
                No slots — default strategy applies at all times.
              </div>
            )}
            {form.slots.map((s, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_1fr_1fr_auto] gap-2 items-center rounded-lg border bg-muted/20 p-2">
                <Select value={String(s.dayOfWeek)} onValueChange={(v) => updSlot(i, { dayOfWeek: Number(v) })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{DAY_NAMES.map((d, di) => <SelectItem key={d} value={String(di)}>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][di]}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="time" className="h-8 text-xs" value={s.from} onChange={(e) => updSlot(i, { from: e.target.value })} aria-label="From" />
                <Input type="time" className="h-8 text-xs" value={s.till} onChange={(e) => updSlot(i, { till: e.target.value })} aria-label="Till" />
                <Input type="number" className="h-8 text-xs" min="0" max="500" value={s.pricingFactorPct} onChange={(e) => updSlot(i, { pricingFactorPct: e.target.value })} placeholder="Disallow (or factor %)" aria-label="Pricing factor" />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => rmSlot(i)} aria-label="Remove slot">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto] mt-4 pt-3 border-t items-end">
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={1} placeholder="e.g. Allowed to surf only during night hours" />
            </Field>
            <div className="flex items-center gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <EnabledSwitch checked={form.enabled} onChange={(v) => set("enabled", v)} /> Enabled
              </label>
              <Button onClick={submit} disabled={saving} className="min-w-[120px]">
                {saving ? "Saving…" : editingId ? "Update Policy" : "Create Policy"}
              </Button>
            </div>
          </div>
        </PolicyFormCard>
      }
      table={
        <PolicyTable headers={["Policy Name", "Default", "Slots", "Slot Details", "Bound Plans", "Enabled"]} isLoading={isLoading}>
          <EmptyRow colSpan={7} />
          {policies.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className={p.defaultStrategy === "DISALLOW" ? "text-red-600 border-red-500/40" : "text-emerald-600 border-emerald-500/40"}>
                  {p.defaultStrategy}
                </Badge>
              </TableCell>
              <TableCell className="tabular-nums">{p.slots?.length || 0}</TableCell>
              <TableCell className="max-w-[340px]">
                <div className="flex flex-wrap gap-1">
                  {(p.slots || []).slice(0, 4).map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                      {DAY_NAMES[s.dayOfWeek]} {s.from?.slice(0, 5)}–{s.till?.slice(0, 5)}{s.pricingFactorPct !== null && s.pricingFactorPct !== undefined ? ` ×${s.pricingFactorPct}%` : " ⛔"}
                    </Badge>
                  ))}
                  {(p.slots?.length || 0) > 4 && <Badge variant="secondary" className="text-[10px]">+{p.slots.length - 4}</Badge>}
                </div>
              </TableCell>
              <TableCell><PlanCountBadge count={p.planCount} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2 justify-end">
                  <EnabledSwitch
                    checked={p.enabled}
                    disabled={delBusy === p.id}
                    onChange={async (v) => {
                      try { await savePolicy("/api/policies/access-time", "PATCH", { enabled: v }, p.id); invalidate(); }
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
