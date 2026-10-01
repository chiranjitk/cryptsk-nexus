"use client";

// ═══════════════════════════════════════════════════════════════
// Notification Rules — event → channel routing (extracted from
// notifications-page; campaigns stay in Settings→Notifications)
// ═══════════════════════════════════════════════════════════════
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, Plus, Loader2, Save, Trash2, Pencil, ArrowRight } from "lucide-react";
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

interface NotificationRule {
  id: string;
  name: string;
  triggerEvent: string;
  channel: string;
  templateId: string;
  message: string;
  isActive: boolean;
  createdAt: string;
}

const CHANNELS = ["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"];
const TRIGGER_EVENTS = [
  "invoice.generated", "invoice.paid", "invoice.overdue", "payment.received",
  "subscriber.created", "subscriber.suspended", "subscriber.expired",
  "plan.changed", "complaint.opened", "complaint.resolved",
  "alert.triggered", "radius.auth-failure", "device.offline", "custom",
];

const EMPTY = { name: "", triggerEvent: "invoice.generated", channel: "IN_APP", templateId: "", message: "", isActive: true };

export function NotificationRulesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRule | null>(null);

  const { data, isLoading } = useQuery<{ rules: NotificationRule[] }>({
    queryKey: ["notification-rules"],
    queryFn: () => apiFetch("/api/notification-rules"),
    refetchInterval: 30000,
  });
  const rules = data?.rules ?? [];

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => editing
      ? apiFetch("/api/notification-rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...body }) })
      : apiFetch("/api/notification-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notification-rules"] }); toast.success(editing ? "Rule updated" : "Rule created"); setDialogOpen(false); },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notification-rules?id=${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notification-rules"] }); toast.success("Rule deleted"); setDeleteTarget(null); },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });
  const toggle = useMutation({
    mutationFn: (rule: NotificationRule) => apiFetch("/api/notification-rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, name: rule.name, triggerEvent: rule.triggerEvent, channel: rule.channel, templateId: rule.templateId, message: rule.message, isActive: !rule.isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-rules"] }),
    onError: (e: Error) => toast.error(e.message || "Toggle failed"),
  });

  function openCreate() { setEditing(null); setForm(EMPTY); setDialogOpen(true); }
  function openEdit(rule: NotificationRule) {
    setEditing(rule);
    setForm({ name: rule.name, triggerEvent: rule.triggerEvent || "custom", channel: rule.channel || "IN_APP", templateId: rule.templateId, message: rule.message, isActive: rule.isActive });
    setDialogOpen(true);
  }

  const channelBadge = (ch: string) => {
    const styles: Record<string, string> = {
      IN_APP: "bg-slate-100 text-slate-700 border-slate-200", EMAIL: "bg-sky-100 text-sky-700 border-sky-200",
      SMS: "bg-orange-100 text-orange-700 border-orange-200", WHATSAPP: "bg-green-100 text-green-700 border-green-200",
      PUSH: "bg-amber-100 text-amber-700 border-amber-200",
    };
    return <Badge className={`text-[10px] ${styles[ch] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>{ch}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Bell className="h-5 w-5 text-primary" />Notification Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Route platform events to customer channels — pairs with the gateways configured in <span className="font-medium text-foreground">INTEGRATIONS</span>.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm" className="text-xs h-8" onClick={openCreate}><Plus className="h-3 w-3 mr-1" />New Rule</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Edit Notification Rule" : "Create Notification Rule"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-1">
              <div><Label className="text-sm">Rule Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Invoice paid → WhatsApp" className="mt-1" /></div>
              <div>
                <Label className="text-sm">Trigger Event</Label>
                <Select value={form.triggerEvent} onValueChange={(v) => setForm((f) => ({ ...f, triggerEvent: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TRIGGER_EVENTS.map((ev) => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}</SelectContent></Select>
              </div>
              <div>
                <Label className="text-sm">Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label className="text-sm">Template ID (optional)</Label><Input value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))} placeholder="Provider template reference" className="mt-1 text-xs" /></div>
              <div><Label className="text-sm">Message Body</Label><Input value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Hi {{name}}, your invoice {{invoice}} is ready…" className="mt-1 text-xs" /></div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><p className="text-sm font-medium">Active</p><p className="text-xs text-muted-foreground">Route events through this rule</p></div>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate(form as unknown as Record<string, unknown>)}>
                  {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}{editing ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border">
        <CardContent className="p-0">
          <div className="rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead className="text-xs">Rule</TableHead>
                <TableHead className="text-xs">Trigger</TableHead>
                <TableHead className="text-xs text-center"><ArrowRight className="h-3 w-3 inline" /></TableHead>
                <TableHead className="text-xs">Channel</TableHead>
                <TableHead className="text-xs">Message</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-10"><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                ) : rules.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center"><Bell className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm font-medium">No notification rules</p><p className="text-xs text-muted-foreground mt-1">Create a rule to route events like invoice.paid to SMS, email or WhatsApp.</p></TableCell></TableRow>
                ) : rules.map((rule) => (
                  <TableRow key={rule.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs font-medium max-w-[160px] truncate">{rule.name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{rule.triggerEvent || "—"}</TableCell>
                    <TableCell className="text-center text-muted-foreground"><ArrowRight className="h-3 w-3 inline" /></TableCell>
                    <TableCell>{channelBadge(rule.channel)}</TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground" title={rule.message}>{rule.message || "—"}</TableCell>
                    <TableCell><Switch checked={rule.isActive} onCheckedChange={() => toggle.mutate(rule)} aria-label={`Toggle ${rule.name}`} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => openEdit(rule)}><Pencil className="h-3 w-3" /></Button>
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
            <AlertDialogTitle>Delete notification rule?</AlertDialogTitle>
            <AlertDialogDescription><span className="font-medium">{deleteTarget?.name}</span> will stop routing events. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>Delete Rule</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default NotificationRulesPage;
