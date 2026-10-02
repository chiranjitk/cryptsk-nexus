"use client";

// ─── Data Transfer Policies (POL-ENGINE-1) ────────────────────────
// 24online-parity volume quota: Absolute (capped) or Ratebased
// (postpaid), rates on Total or Individual Up/Down, MB limits,
// optional cycle reset + expiry. Binds to Plans.

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowDownUp, Trash2, Pencil, Infinity as InfinityIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PolicyPageShell, PolicyFormCard, PolicyTable, EmptyRow, PlanCountBadge,
  EnabledSwitch, Field, RadioRow, usePolicyList, savePolicy, useDeletePolicy, useLocalForm,
} from "./policy-shared";

interface DtPolicy {
  id: string;
  name: string;
  scheme: "ABSOLUTE" | "RATEBASED";
  ratesOn: "TOTAL" | "INDIVIDUAL";
  uploadLimitMb: number | null;
  downloadLimitMb: number | null;
  totalLimitMb: number | null;
  cycleType: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  cycleLimitMb: number | null;
  expiryDays: number | null;
  description: string;
  enabled: boolean;
  planCount?: number;
}

interface FormState {
  name: string;
  scheme: "ABSOLUTE" | "RATEBASED";
  ratesOn: "TOTAL" | "INDIVIDUAL";
  uploadLimitMb: string;
  downloadLimitMb: string;
  totalLimitMb: string;
  cycleType: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  cycleLimitMb: string;
  expiryDays: string;
  description: string;
  enabled: boolean;
}

const INITIAL: FormState = {
  name: "", scheme: "ABSOLUTE", ratesOn: "TOTAL", uploadLimitMb: "", downloadLimitMb: "",
  totalLimitMb: "", cycleType: "NONE", cycleLimitMb: "", expiryDays: "", description: "", enabled: true,
};

const gb = (mb: number | null) => (mb === null ? "—" : mb >= 1024 ? `${+(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`);

export default function DataTransferPolicyPage() {
  const { policies, isLoading, invalidate } = usePolicyList<DtPolicy>("/api/policies/data-transfer", "dt-policies");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { form, set, setForm } = useLocalForm<FormState>(INITIAL, editingId);
  const { del, busy: delBusy } = useDeletePolicy("/api/policies/data-transfer", invalidate, "Policy");

  const startEdit = (p: DtPolicy) => {
    setEditingId(p.id);
    setForm({
      name: p.name, scheme: p.scheme, ratesOn: p.ratesOn,
      uploadLimitMb: p.uploadLimitMb === null ? "" : String(p.uploadLimitMb),
      downloadLimitMb: p.downloadLimitMb === null ? "" : String(p.downloadLimitMb),
      totalLimitMb: p.totalLimitMb === null ? "" : String(p.totalLimitMb),
      cycleType: p.cycleType,
      cycleLimitMb: p.cycleLimitMb === null ? "" : String(p.cycleLimitMb),
      expiryDays: p.expiryDays === null ? "" : String(p.expiryDays),
      description: p.description || "", enabled: p.enabled,
    });
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Policy name is required"); return; }
    if (form.scheme === "ABSOLUTE" && !form.uploadLimitMb && !form.downloadLimitMb && !form.totalLimitMb) {
      toast.error("Absolute policy needs at least one data limit");
      return;
    }
    setSaving(true);
    try {
      await savePolicy("/api/policies/data-transfer", editingId ? "PATCH" : "POST", form, editingId || undefined);
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

  return (
    <PolicyPageShell
      title="Data Transfer Policies"
      subtitle="Volume-quota policies — total or per-direction limits in MB, postpaid rate-based mode, cycle reset. Bind to plans."
      icon={<ArrowDownUp className="h-5 w-5" />}
      stats={[
        { label: "Total", value: policies.length },
        { label: "Active", value: policies.filter((p) => p.enabled).length },
        { label: "Bound", value: policies.reduce((s, p) => s + (p.planCount || 0), 0) },
      ]}
      form={
        <PolicyFormCard editing={!!editingId} title={form.name} onClose={() => { setEditingId(null); setForm(INITIAL); }}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Policy Name *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. DR 100 GB Monthly" />
            </Field>
            <Field label="Scheme *">
              <RadioRow
                value={form.scheme}
                onChange={(v) => set("scheme", v)}
                options={[
                  { value: "ABSOLUTE", label: "Absolute", hint: "Fixed data cap" },
                  { value: "RATEBASED", label: "Ratebased", hint: "Postpaid per-MB" },
                ]}
              />
            </Field>
            <Field label="Rates Based On *">
              <RadioRow
                value={form.ratesOn}
                onChange={(v) => set("ratesOn", v)}
                options={[
                  { value: "TOTAL", label: "Total Transfer", hint: "Up + Down combined" },
                  { value: "INDIVIDUAL", label: "Individual", hint: "Separate Up / Down" },
                ]}
              />
            </Field>
            {form.ratesOn === "INDIVIDUAL" && (
              <>
                <Field label="Upload Limit (MB)">
                  <Input type="number" min="0" value={form.uploadLimitMb} onChange={(e) => set("uploadLimitMb", e.target.value)} placeholder="e.g. 51200" />
                </Field>
                <Field label="Download Limit (MB)">
                  <Input type="number" min="0" value={form.downloadLimitMb} onChange={(e) => set("downloadLimitMb", e.target.value)} placeholder="e.g. 153600" />
                </Field>
              </>
            )}
            {form.ratesOn === "TOTAL" && (
              <Field label="Total Limit (MB) *" hint={form.totalLimitMb && Number(form.totalLimitMb) >= 1024 ? `= ${gb(Number(form.totalLimitMb))}` : undefined}>
                <div className="relative">
                  <Input type="number" min="0" value={form.totalLimitMb} onChange={(e) => set("totalLimitMb", e.target.value)} placeholder="e.g. 102400" />
                  {form.totalLimitMb === "" && <InfinityIcon className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />}
                </div>
              </Field>
            )}
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
            <Field label="Cycle Limit (MB)" hint="Quota re-granted each cycle">
              <Input type="number" min="0" value={form.cycleLimitMb} onChange={(e) => set("cycleLimitMb", e.target.value)} disabled={form.cycleType === "NONE"} />
            </Field>
            <Field label="Expiry After (days)">
              <Input type="number" min="0" value={form.expiryDays} onChange={(e) => set("expiryDays", e.target.value)} placeholder="e.g. 30" />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={1} />
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
        <PolicyTable headers={["Policy Name", "Scheme", "Rates On", "Upload", "Download", "Total", "Cycle", "Bound Plans", "Enabled"]} isLoading={isLoading}>
          <EmptyRow colSpan={10} />
          {policies.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className={p.scheme === "RATEBASED" ? "text-amber-600 border-amber-500/40 text-[11px]" : "text-[11px]"}>{p.scheme}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{p.ratesOn}</TableCell>
              <TableCell className="tabular-nums">{gb(p.uploadLimitMb)}</TableCell>
              <TableCell className="tabular-nums">{gb(p.downloadLimitMb)}</TableCell>
              <TableCell className="tabular-nums font-medium">{gb(p.totalLimitMb)}</TableCell>
              <TableCell>
                {p.cycleType === "NONE" ? <span className="text-muted-foreground text-xs">—</span> : <span className="text-xs">{p.cycleType} · {gb(p.cycleLimitMb)}</span>}
              </TableCell>
              <TableCell><PlanCountBadge count={p.planCount} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2 justify-end">
                  <EnabledSwitch
                    checked={p.enabled}
                    disabled={delBusy === p.id}
                    onChange={async (v) => {
                      try { await savePolicy("/api/policies/data-transfer", "PATCH", { enabled: v }, p.id); invalidate(); }
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
