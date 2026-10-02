"use client";

// ─── Bandwidth Policies (POL-ENGINE-1) ────────────────────────────
// speed policies: Pool/User base, Strict/Committed,
// priority 0-7, per-user or shared usage, up/down/total Kbps. Binds
// to Plans and serves as FAP switch-over target.

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Gauge, Trash2, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PolicyPageShell, PolicyFormCard, PolicyTable, EmptyRow, PlanCountBadge,
  EnabledSwitch, Field, RadioRow, usePolicyList, savePolicy, useDeletePolicy, useLocalForm,
} from "./policy-shared";

interface BwPolicy {
  id: string;
  name: string;
  policyFor: "POOL" | "USER";
  policyType: "STRICT" | "COMMITTED";
  priority: number;
  uploadKbps: number;
  downloadKbps: number;
  totalKbps: number | null;
  shared: boolean;
  description: string;
  enabled: boolean;
  planCount?: number;
  fapCount?: number;
}

interface FormState {
  name: string;
  policyFor: "POOL" | "USER";
  policyType: "STRICT" | "COMMITTED";
  priority: string;
  uploadKbps: string;
  downloadKbps: string;
  totalKbps: string;
  shared: boolean;
  description: string;
  enabled: boolean;
}

const INITIAL: FormState = {
  name: "", policyFor: "USER", policyType: "STRICT", priority: "5",
  uploadKbps: "", downloadKbps: "", totalKbps: "", shared: false, description: "", enabled: true,
};

const kbps = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)} Mbps` : `${v} Kbps`);

export default function BandwidthPolicyPage() {
  const { policies, isLoading, invalidate } = usePolicyList<BwPolicy>("/api/policies/bandwidth", "bw-policies");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { form, set, setForm } = useLocalForm<FormState>(INITIAL, editingId);
  const { del, busy: delBusy } = useDeletePolicy("/api/policies/bandwidth", invalidate, "Policy");

  const startEdit = (p: BwPolicy) => {
    setEditingId(p.id);
    setForm({
      name: p.name, policyFor: p.policyFor, policyType: p.policyType, priority: String(p.priority),
      uploadKbps: p.uploadKbps ? String(p.uploadKbps) : "",
      downloadKbps: p.downloadKbps ? String(p.downloadKbps) : "",
      totalKbps: p.totalKbps === null || p.totalKbps === undefined ? "" : String(p.totalKbps),
      shared: p.shared, description: p.description || "", enabled: p.enabled,
    });
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Policy name is required"); return; }
    if (!form.uploadKbps && !form.downloadKbps && !form.totalKbps) {
      toast.error("Provide upload, download or total bandwidth");
      return;
    }
    setSaving(true);
    try {
      await savePolicy("/api/policies/bandwidth", editingId ? "PATCH" : "POST", form, editingId || undefined);
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
      title="Bandwidth Policies"
      subtitle="Speed-cap policies — per-user or per-pool, strict or committed, priority 0–7. Bind to plans; also the FAP switch-over target."
      icon={<Gauge className="h-5 w-5" />}
      stats={[
        { label: "Total", value: policies.length },
        { label: "Active", value: policies.filter((p) => p.enabled).length },
        { label: "Bound", value: policies.reduce((s, p) => s + (p.planCount || 0), 0) },
      ]}
      form={
        <PolicyFormCard editing={!!editingId} title={form.name} onClose={() => { setEditingId(null); setForm(INITIAL); }}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Policy Name *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 100 Mbps FTTH" />
            </Field>
            <Field label="Policy For *">
              <RadioRow
                value={form.policyFor}
                onChange={(v) => set("policyFor", v)}
                options={[
                  { value: "USER", label: "User", hint: "Per subscriber" },
                  { value: "POOL", label: "Pool", hint: "Shared IP pool" },
                ]}
              />
            </Field>
            <Field label="Policy Type *">
              <RadioRow
                value={form.policyType}
                onChange={(v) => set("policyType", v)}
                options={[
                  { value: "STRICT", label: "Strict", hint: "Hard cap" },
                  { value: "COMMITTED", label: "Committed", hint: "Guaranteed min rate" },
                ]}
              />
            </Field>
            <Field label="Download Bandwidth (Kbps) *">
              <Input type="number" min="0" value={form.downloadKbps} onChange={(e) => set("downloadKbps", e.target.value)} placeholder="e.g. 102400" />
            </Field>
            <Field label="Upload Bandwidth (Kbps) *">
              <Input type="number" min="0" value={form.uploadKbps} onChange={(e) => set("uploadKbps", e.target.value)} placeholder="e.g. 51200" />
            </Field>
            <Field label="Total Bandwidth (Kbps)" hint="Optional aggregate cap">
              <Input type="number" min="0" value={form.totalKbps} onChange={(e) => set("totalKbps", e.target.value)} />
            </Field>
            <Field label="Priority (0–7) *" hint="0 = highest priority">
              <Input type="number" min="0" max="7" value={form.priority} onChange={(e) => set("priority", e.target.value)} />
            </Field>
            <Field label="Bandwidth Usage">
              <RadioRow
                value={form.shared ? "SHARED" : "INDIVIDUAL"}
                onChange={(v) => set("shared", v === "SHARED")}
                options={[
                  { value: "INDIVIDUAL", label: "Individual", hint: "Dedicated per user" },
                  { value: "SHARED", label: "Shared", hint: "Pooled across users" },
                ]}
              />
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
        <PolicyTable headers={["Policy Name", "Based On", "Type", "Download", "Upload", "Priority", "Usage", "Bound", "Enabled"]} isLoading={isLoading}>
          <EmptyRow colSpan={10} />
          {policies.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell><Badge variant="outline" className="text-[11px]">{p.policyFor}</Badge></TableCell>
              <TableCell>
                <Badge variant="outline" className={p.policyType === "COMMITTED" ? "text-blue-600 border-blue-500/40 text-[11px]" : "text-[11px]"}>{p.policyType}</Badge>
              </TableCell>
              <TableCell className="tabular-nums">{p.downloadKbps ? kbps(p.downloadKbps) : "—"}</TableCell>
              <TableCell className="tabular-nums">{p.uploadKbps ? kbps(p.uploadKbps) : "—"}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{p.priority}</TableCell>
              <TableCell><span className="text-xs text-muted-foreground">{p.shared ? "Shared" : "Individual"}</span></TableCell>
              <TableCell><PlanCountBadge count={p.planCount} />{(p.fapCount || 0) > 0 && <Badge variant="outline" className="ml-1 text-[10px] text-amber-600 border-amber-500/40">FAP ×{p.fapCount}</Badge>}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2 justify-end">
                  <EnabledSwitch
                    checked={p.enabled}
                    disabled={delBusy === p.id}
                    onChange={async (v) => {
                      try { await savePolicy("/api/policies/bandwidth", "PATCH", { enabled: v }, p.id); invalidate(); }
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
