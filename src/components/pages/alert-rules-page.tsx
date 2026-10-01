"use client";

// ═══════════════════════════════════════════════════════════════
// Alert Rules — CRUD for AlertRule (extracted from network-alerts-page)
// ═══════════════════════════════════════════════════════════════
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ClipboardList, Plus, Loader2, Save, Trash2, PauseCircle, Zap, ShieldAlert, Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { useIntegrationAction } from "@/components/integrations/shared";

interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: string;
  notifyChannels: string | null;
  cooldownMinutes: number;
  enabled: boolean;
  escalationEnabled: boolean;
  escalationLevels: string | null;
  autoEscalate: boolean;
  escalationIntervalMinutes: number;
  maxSeverity: string;
  deduplicationWindowMinutes: number;
  activeSuppression?: { reason: string; endsAt: string | null } | null;
}

const EMPTY_FORM = {
  name: "", condition: "", threshold: 0, severity: "MEDIUM", notifyChannels: "IN_APP,EMAIL",
  cooldownMinutes: 5, enabled: true, escalationEnabled: false, autoEscalate: false,
  escalationIntervalMinutes: 30, maxSeverity: "CRITICAL", deduplicationWindowMinutes: 10,
};

export function AlertRulesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);

  const { data, isLoading } = useQuery<{ rules: AlertRule[] }>({
    queryKey: ["alert-rules", search],
    queryFn: () => apiFetch(`/api/alerts?ruleSearch=${encodeURIComponent(search)}`),
    refetchInterval: 30000,
  });
  const rules = (data?.rules ?? []).filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const action = useIntegrationAction();

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); }
  function openEdit(rule: AlertRule) {
    setEditing(rule);
    setForm({
      name: rule.name, condition: rule.condition, threshold: rule.threshold, severity: rule.severity,
      notifyChannels: rule.notifyChannels ?? "IN_APP", cooldownMinutes: rule.cooldownMinutes, enabled: rule.enabled,
      escalationEnabled: rule.escalationEnabled, autoEscalate: rule.autoEscalate,
      escalationIntervalMinutes: rule.escalationIntervalMinutes, maxSeverity: rule.maxSeverity,
      deduplicationWindowMinutes: rule.deduplicationWindowMinutes,
    });
    setDialogOpen(true);
  }
  function save() {
    if (!form.name.trim()) { toast.error("Rule name is required"); return; }
    const body: Record<string, unknown> = editing
      ? { action: "update-rule", ruleId: editing.id, ...form }
      : { action: "create-rule", ...form };
    action.mutate(body, {
      onSuccess: () => { toast.success(editing ? "Rule updated" : "Rule created"); setDialogOpen(false); },
      onError: (e: Error) => toast.error(e.message || "Save failed"),
    });
  }
  function toggleRule(rule: AlertRule) {
    action.mutate({ action: "toggle-rule", ruleId: rule.id } as Record<string, unknown>, {
      onSuccess: () => toast.success(`${rule.name} ${!rule.enabled ? "enabled" : "disabled"}`),
      onError: (e: Error) => toast.error(e.message || "Toggle failed"),
    });
  }
  function suppressRule(rule: AlertRule) {
    action.mutate({ action: "suppress-rule", ruleId: rule.id, reason: "Manual suppression from Alert Rules page", suppressedBy: "admin" } as Record<string, unknown>, {
      onSuccess: () => toast.success(`${rule.name} suppressed for 1 hour`),
      onError: (e: Error) => toast.error(e.message || "Suppress failed"),
    });
  }
  function confirmDelete() {
    if (!deleteTarget) return;
    action.mutate({ action: "delete-rule", ruleId: deleteTarget.id } as Record<string, unknown>, {
      onSuccess: () => { toast.success("Rule deleted"); setDeleteTarget(null); },
      onError: (e: Error) => toast.error(e.message || "Delete failed"),
    });
  }

  const sevBadge = (sev: string) => (
    <Badge className={`text-[10px] ${sev === "CRITICAL" ? "bg-red-100 text-red-700 border-red-200" : sev === "HIGH" ? "bg-orange-100 text-orange-700 border-orange-200" : sev === "MEDIUM" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}`}>{sev}</Badge>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" />Alert Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Define thresholds, dedup windows and escalation ladders that generate live alerts.</p>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rules…" className="h-8 w-44 text-xs" />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button size="sm" className="text-xs h-8" onClick={openCreate}><Plus className="h-3 w-3 mr-1" />New Rule</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto nice-scroll">
              <DialogHeader><DialogTitle>{editing ? "Edit Alert Rule" : "Create Alert Rule"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-1">
                <div><Label className="text-sm">Rule Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. High CPU on OLT" className="mt-1" /></div>
                <div><Label className="text-sm">Condition</Label><Input value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))} placeholder="e.g. cpu_usage > threshold" className="mt-1 font-mono text-xs" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-sm">Threshold</Label><Input type="number" value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: parseFloat(e.target.value) || 0 }))} className="mt-1" /></div>
                  <div><Label className="text-sm">Severity</Label>
                    <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-sm">Cooldown (min)</Label><Input type="number" value={form.cooldownMinutes} onChange={(e) => setForm((f) => ({ ...f, cooldownMinutes: parseInt(e.target.value) || 0 }))} className="mt-1" /></div>
                  <div><Label className="text-sm">Dedup Window (min)</Label><Input type="number" value={form.deduplicationWindowMinutes} onChange={(e) => setForm((f) => ({ ...f, deduplicationWindowMinutes: parseInt(e.target.value) || 0 }))} className="mt-1" /></div>
                </div>
                <div><Label className="text-sm">Notify Channels (comma-separated)</Label><Input value={form.notifyChannels ?? ""} onChange={(e) => setForm((f) => ({ ...f, notifyChannels: e.target.value }))} placeholder="IN_APP,EMAIL,SMS,WHATSAPP" className="mt-1 text-xs" /></div>
                <div className="rounded-lg border p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm font-medium">Escalation enabled</p><p className="text-xs text-muted-foreground">Escalate when unresolved</p></div>
                    <Switch checked={form.escalationEnabled} onCheckedChange={(v) => setForm((f) => ({ ...f, escalationEnabled: v }))} />
                  </div>
                  {form.escalationEnabled && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label className="text-xs">Auto-escalate</Label>
                          <Select value={form.autoEscalate ? "yes" : "no"} onValueChange={(v) => setForm((f) => ({ ...f, autoEscalate: v === "yes" }))}><SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="yes">Yes — escalate on interval</SelectItem><SelectItem value="no">No — manual only</SelectItem></SelectContent></Select>
                        </div>
                        <div><Label className="text-xs">Interval (min)</Label><Input type="number" className="mt-1 h-8 text-xs" value={form.escalationIntervalMinutes} onChange={(e) => setForm((f) => ({ ...f, escalationIntervalMinutes: parseInt(e.target.value) || 0 }))} /></div>
                      </div>
                      <div><Label className="text-xs">Max Severity Ceiling</Label>
                        <Select value={form.maxSeverity} onValueChange={(v) => setForm((f) => ({ ...f, maxSeverity: v }))}><SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{["MEDIUM", "HIGH", "CRITICAL"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div><p className="text-sm font-medium">Enabled</p><p className="text-xs text-muted-foreground">Rule fires when condition is met</p></div>
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button disabled={action.isPending} onClick={save}>{action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}{editing ? "Update Rule" : "Create Rule"}</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border">
        <CardContent className="p-0">
          <div className="rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead className="text-xs">Rule</TableHead>
                <TableHead className="text-xs">Condition</TableHead>
                <TableHead className="text-xs">Severity</TableHead>
                <TableHead className="text-xs">Cooldown</TableHead>
                <TableHead className="text-xs">Escalation</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-10"><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                ) : rules.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center"><ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm font-medium">No alert rules</p><p className="text-xs text-muted-foreground mt-1">Create a rule to start monitoring thresholds.</p></TableCell></TableRow>
                ) : rules.map((rule) => (
                  <TableRow key={rule.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs font-medium max-w-[180px] truncate" title={rule.name}>{rule.name}</TableCell>
                    <TableCell className="text-xs font-mono max-w-[180px] truncate text-muted-foreground" title={rule.condition}>{rule.condition || "—"}</TableCell>
                    <TableCell>{sevBadge(rule.severity)}</TableCell>
                    <TableCell className="text-xs">{rule.cooldownMinutes}m</TableCell>
                    <TableCell className="text-xs">{rule.escalationEnabled ? <span className="inline-flex items-center gap-1 text-violet-600"><Zap className="h-3 w-3" />{rule.autoEscalate ? `auto/${rule.escalationIntervalMinutes}m` : "manual"}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {rule.activeSuppression ? <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]"><PauseCircle className="h-3 w-3 mr-1" />Suppressed</Badge> :
                        <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule)} aria-label={`Toggle ${rule.name}`} />}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => openEdit(rule)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Suppress 1h" onClick={() => suppressRule(rule)}><ShieldAlert className="h-3 w-3" /></Button>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-red-600" title="Delete" onClick={() => setDeleteTarget(rule)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alert rule?</AlertDialogTitle>
            <AlertDialogDescription><span className="font-medium">{deleteTarget?.name}</span> will stop generating alerts immediately. Historical alerts are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmDelete}>Delete Rule</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AlertRulesPage;
