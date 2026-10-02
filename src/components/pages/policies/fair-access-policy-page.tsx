"use client";

// ─── Fair Access Policies (POL-ENGINE-1) ──────────────────────────
// FAP: after the data limit is crossed the subscriber
// is throttled to the switch-over bandwidth policy. Reset cycles
// re-grant the quota (D/W/M × multiplier at reset time).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hourglass, Trash2, Pencil, ArrowDownWideNarrow } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PolicyPageShell, PolicyFormCard, PolicyTable, EmptyRow, PlanCountBadge,
  EnabledSwitch, Field, RadioRow, usePolicyList, savePolicy, useDeletePolicy, useLocalForm,
} from "./policy-shared";

interface SwPolicy {
  id: string;
  name: string;
  downloadKbps: number;
  uploadKbps: number;
}

interface FapPolicy {
  id: string;
  name: string;
  fapType: "RESET" | "NON_RESET";
  resetType: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  resetMultiplier: number;
  resetTime: string;
  dataOn: "UPLOAD" | "DOWNLOAD" | "TOTAL";
  limitMb: number;
  switchOverBandwidthPolicy: SwPolicy | null;
  description: string;
  enabled: boolean;
  planCount?: number;
}

interface FormState {
  name: string;
  fapType: "RESET" | "NON_RESET";
  resetType: "DAILY" | "WEEKLY" | "MONTHLY";
  resetMultiplier: string;
  resetTime: string;
  dataOn: "UPLOAD" | "DOWNLOAD" | "TOTAL";
  limitValue: string;
  limitUnit: "MB" | "GB" | "TB";
  switchOverBandwidthPolicyId: string;
  description: string;
  enabled: boolean;
}

const INITIAL: FormState = {
  name: "", fapType: "RESET", resetType: "MONTHLY", resetMultiplier: "1", resetTime: "23:59",
  dataOn: "TOTAL", limitValue: "", limitUnit: "GB", switchOverBandwidthPolicyId: "", description: "", enabled: true,
};

const mb = (v: number) => (v >= 1048576 ? `${+(v / 1048576).toFixed(1)} TB` : v >= 1024 ? `${+(v / 1024).toFixed(v % 1024 === 0 ? 0 : 1)} GB` : `${v} MB`);

function toMb(value: string, unit: "MB" | "GB" | "TB"): number {
  const n = Number(value) || 0;
  return unit === "TB" ? Math.round(n * 1048576) : unit === "GB" ? Math.round(n * 1024) : Math.round(n);
}

export default function FairAccessPolicyPage() {
  const { policies, isLoading, invalidate } = usePolicyList<FapPolicy>("/api/policies/fair-access", "fap-policies");
  const { data: bwData } = useQuery({
    queryKey: ["bw-policies-for-fap"],
    queryFn: () => apiFetch<{ policies: SwPolicy[] }>("/api/policies/bandwidth"),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { form, set, setForm } = useLocalForm<FormState>(INITIAL, editingId);
  const { del, busy: delBusy } = useDeletePolicy("/api/policies/fair-access", invalidate, "Policy");

  const fromMb = (mbVal: number): { value: string; unit: "MB" | "GB" | "TB" } => {
    if (mbVal >= 1048576 && mbVal % 1048576 === 0) return { value: String(mbVal / 1048576), unit: "TB" };
    if (mbVal >= 1024 && mbVal % 1024 === 0) return { value: String(mbVal / 1024), unit: "GB" };
    return { value: String(mbVal), unit: "MB" };
  };

  const startEdit = (p: FapPolicy) => {
    setEditingId(p.id);
    const lim = fromMb(p.limitMb || 0);
    setForm({
      name: p.name, fapType: p.fapType,
      resetType: p.resetType === "NONE" ? "MONTHLY" : (p.resetType as "DAILY" | "WEEKLY" | "MONTHLY"),
      resetMultiplier: String(p.resetMultiplier),
      resetTime: (p.resetTime || "23:59:59").slice(0, 5),
      dataOn: p.dataOn, limitValue: lim.value, limitUnit: lim.unit,
      switchOverBandwidthPolicyId: p.switchOverBandwidthPolicy?.id || "",
      description: p.description || "", enabled: p.enabled,
    });
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Policy name is required"); return; }
    const limitMb = toMb(form.limitValue, form.limitUnit);
    if (limitMb <= 0) { toast.error("Data transfer limit must be greater than 0"); return; }
    setSaving(true);
    try {
      await savePolicy("/api/policies/fair-access", editingId ? "PATCH" : "POST", {
        ...form,
        limitMb,
        switchOverBandwidthPolicyId: form.switchOverBandwidthPolicyId || null,
        resetTime: form.resetTime.length === 5 ? `${form.resetTime}:00` : form.resetTime,
      }, editingId || undefined);
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
      title="Fair Access Policies"
      subtitle="After the data limit is crossed, subscribers are throttled to the switch-over bandwidth policy. Quota resets on schedule."
      icon={<Hourglass className="h-5 w-5" />}
      stats={[
        { label: "Total", value: policies.length },
        { label: "Active", value: policies.filter((p) => p.enabled).length },
        { label: "Bound", value: policies.reduce((s, p) => s + (p.planCount || 0), 0) },
      ]}
      form={
        <PolicyFormCard editing={!!editingId} title={form.name} onClose={() => { setEditingId(null); setForm(INITIAL); }}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="FAP Name *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. FAP 5GB → 1Mbps" />
            </Field>
            <Field label="FAP Type *">
              <RadioRow
                value={form.fapType}
                onChange={(v) => set("fapType", v)}
                options={[
                  { value: "RESET", label: "Reset", hint: "Quota renews each cycle" },
                  { value: "NON_RESET", label: "Non-Reset", hint: "One-time limit" },
                ]}
              />
            </Field>
            <Field label="Data Transfer Type *">
              <RadioRow
                value={form.dataOn}
                onChange={(v) => set("dataOn", v)}
                options={[
                  { value: "UPLOAD", label: "Upload" },
                  { value: "DOWNLOAD", label: "Download" },
                  { value: "TOTAL", label: "Total" },
                ]}
              />
            </Field>
            <Field label="Reset Type *">
              <RadioRow
                value={form.resetType}
                onChange={(v) => set("resetType", v)}
                options={[
                  { value: "DAILY", label: "Daily" },
                  { value: "WEEKLY", label: "Weekly" },
                  { value: "MONTHLY", label: "Monthly" },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reset Multiplier *" hint="Every N cycles">
                <Input type="number" min="1" value={form.resetMultiplier} onChange={(e) => set("resetMultiplier", e.target.value)} />
              </Field>
              <Field label="Reset Time *" hint="HH:MM">
                <Input type="time" value={form.resetTime} onChange={(e) => set("resetTime", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_110px] gap-2 items-end">
              <Field label={`Data Transfer Limit * (${form.limitUnit})`}>
                <Input type="number" min="0" step="any" value={form.limitValue} onChange={(e) => set("limitValue", e.target.value)} placeholder="e.g. 5" />
              </Field>
              <Field label="Unit">
                <Select value={form.limitUnit} onValueChange={(v) => set("limitUnit", v as "MB" | "GB" | "TB")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MB">MB</SelectItem>
                    <SelectItem value="GB">GB</SelectItem>
                    <SelectItem value="TB">TB</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Switch-Over Bandwidth Policy *" hint="Speed applied once the limit is crossed">
                <Select value={form.switchOverBandwidthPolicyId} onValueChange={(v) => set("switchOverBandwidthPolicyId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select a bandwidth policy" /></SelectTrigger>
                  <SelectContent>
                    {(bwData?.policies || []).filter((p) => p.enabled).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.downloadKbps >= 1000 ? `${+(p.downloadKbps / 1000).toFixed(0)}M` : `${p.downloadKbps}K`}↓ / {p.uploadKbps >= 1000 ? `${+(p.uploadKbps / 1000).toFixed(0)}M` : `${p.uploadKbps}K`}↑)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
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
        <PolicyTable headers={["FAP Name", "Type", "Reset", "Data On", "Limit", "Switch-Over To", "Bound Plans", "Enabled"]} isLoading={isLoading}>
          <EmptyRow colSpan={9} />
          {policies.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className={p.fapType === "NON_RESET" ? "text-amber-600 border-amber-500/40 text-[11px]" : "text-emerald-600 border-emerald-500/40 text-[11px]"}>{p.fapType.replace("_", "-")}</Badge>
              </TableCell>
              <TableCell className="text-xs">
                {p.fapType === "RESET" ? `${p.resetType} ×${p.resetMultiplier} @ ${p.resetTime?.slice(0, 5)}` : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{p.dataOn}</TableCell>
              <TableCell className="tabular-nums font-medium">{mb(p.limitMb)}</TableCell>
              <TableCell>
                {p.switchOverBandwidthPolicy ? (
                  <Badge variant="outline" className="gap-1 text-[11px]">
                    <ArrowDownWideNarrow className="h-3 w-3" />
                    {p.switchOverBandwidthPolicy.name}
                  </Badge>
                ) : <span className="text-xs text-destructive">not set</span>}
              </TableCell>
              <TableCell><PlanCountBadge count={p.planCount} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2 justify-end">
                  <EnabledSwitch
                    checked={p.enabled}
                    disabled={delBusy === p.id}
                    onChange={async (v) => {
                      try { await savePolicy("/api/policies/fair-access", "PATCH", { enabled: v }, p.id); invalidate(); }
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
