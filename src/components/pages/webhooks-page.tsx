"use client";

// ═══════════════════════════════════════════════════════════════
// Webhooks & Events — endpoint CRUD + delivery history
// ═══════════════════════════════════════════════════════════════
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Webhook, Plus, Trash2, Loader2, CheckCircle2, XCircle, Clock,
  Copy, Check, KeyRound, Activity, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { WEBHOOK_EVENTS, useIntegrationAction, formatTimestamp } from "@/components/integrations/shared";

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: string;
  statusCode: number;
  success: boolean;
  duration: number;
  errorMessage: string;
  createdAt: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string;
  secret: string;
  enabled: boolean;
  lastDeliveryAt: string | null;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  deliveries: WebhookDelivery[];
}

export function WebhooksPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ webhooks: Webhook[] }>({
    queryKey: ["integrations", "webhooks"],
    queryFn: () => apiFetch("/api/integrations?type=webhooks"),
    refetchInterval: 20000,
  });
  const webhooks = data?.webhooks ?? [];
  const action = useIntegrationAction();

  function toggleEvent(event: string) {
    setSelectedEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }
  function createWebhook() {
    if (!newUrl || selectedEvents.length === 0) {
      toast.error("URL and at least one event are required");
      return;
    }
    action.mutate(
      { action: "create_webhook", url: newUrl, events: selectedEvents, secret: newSecret || undefined } as Record<string, unknown>,
      {
        onSuccess: () => { toast.success("Webhook endpoint created"); setCreateOpen(false); setNewUrl(""); setNewSecret(""); setSelectedEvents([]); },
        onError: (e: Error) => toast.error(e.message || "Create failed"),
      }
    );
  }
  function toggleWebhook(wh: Webhook) {
    action.mutate(
      { action: "toggle_webhook", webhookId: wh.id } as Record<string, unknown>,
      {
        onSuccess: () => toast.success(`Webhook ${!wh.enabled ? "activated" : "deactivated"}`),
        onError: (e: Error) => toast.error(e.message || "Toggle failed"),
      }
    );
  }
  function confirmDelete() {
    if (!deleteTarget) return;
    action.mutate(
      { action: "delete_webhook", webhookId: deleteTarget.id } as Record<string, unknown>,
      {
        onSuccess: () => { toast.success("Webhook deleted"); setDeleteTarget(null); },
        onError: (e: Error) => toast.error(e.message || "Delete failed"),
      }
    );
  }
  function copySecret(wh: Webhook) {
    navigator.clipboard.writeText(wh.secret);
    setCopiedId(wh.id);
    setTimeout(() => setCopiedId(null), 1200);
  }

  const totalDeliveries = webhooks.reduce((s, w) => s + w.successCount + w.failureCount, 0);
  const successRate = totalDeliveries > 0 ? Math.round(webhooks.reduce((s, w) => s + w.successCount, 0) / totalDeliveries * 100) : 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Webhook className="h-5 w-5 text-primary" />Webhooks & Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure URLs to receive real-time event notifications from the platform.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-xs h-8"><Plus className="h-3 w-3 mr-1" />Add Endpoint</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Webhook Endpoint</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div><Label className="text-sm">Endpoint URL</Label><Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://your-server.com/webhooks/cryptsk" className="mt-1" /></div>
              <div><Label className="text-sm">Signing Secret (optional — auto-generated if empty)</Label><Input value={newSecret} onChange={(e) => setNewSecret(e.target.value)} placeholder="whsec_..." className="mt-1 font-mono text-xs" /></div>
              <div>
                <Label className="text-sm">Subscribe to events ({selectedEvents.length} selected)</Label>
                <div className="grid grid-cols-1 gap-1.5 mt-2 rounded-lg border p-3 max-h-40 overflow-y-auto nice-scroll">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 rounded px-1 py-1">
                      <input type="checkbox" checked={selectedEvents.includes(ev)} onChange={() => toggleEvent(ev)} className="accent-[#DC2626]" />
                      <span className="font-mono">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button disabled={action.isPending || !newUrl || selectedEvents.length === 0} onClick={createWebhook}>
                  {action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}Create
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Webhook className="h-5 w-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">Endpoints</p><p className="text-xl font-bold">{webhooks.length}</p></div>
        </CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100"><Activity className="h-5 w-5 text-emerald-600" /></div>
          <div><p className="text-xs text-muted-foreground">Delivery Success Rate</p><p className="text-xl font-bold text-emerald-700">{successRate}%</p></div>
        </CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-100"><KeyRound className="h-5 w-5 text-violet-600" /></div>
          <div><p className="text-xs text-muted-foreground">Total Deliveries</p><p className="text-xl font-bold">{totalDeliveries}</p></div>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : webhooks.length === 0 ? (
        <Card className="border"><CardContent className="py-16 text-center"><Webhook className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-lg font-semibold">No Webhook Endpoints</p><p className="text-sm text-muted-foreground mt-1">Add an endpoint to receive real-time events like invoice.paid or subscriber.created.</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => {
            let events: string[] = [];
            try { events = JSON.parse(wh.events || "[]"); } catch { /* ignore */ }
            const total = wh.successCount + wh.failureCount;
            return (
              <Card key={wh.id} className="border overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm font-mono truncate" title={wh.url}>{wh.url}</CardTitle>
                      <CardDescription className="text-xs mt-1 flex flex-wrap items-center gap-2">
                        {wh.enabled ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge> : <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-[10px]">Disabled</Badge>}
                        <span>· {events.length} events</span>
                        <span>· {total} deliveries ({wh.successCount}✓ / {wh.failureCount}✗)</span>
                        {wh.lastDeliveryAt && <span>· last: {formatTimestamp(wh.lastDeliveryAt)}</span>}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.enabled} onCheckedChange={() => toggleWebhook(wh)} aria-label="Toggle webhook" />
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => setDeleteTarget(wh)} title="Delete endpoint"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {events.map((ev) => <Badge key={ev} variant="secondary" className="text-[10px] font-mono">{ev}</Badge>)}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Signing secret:</span>
                    <code className="font-mono bg-muted px-2 py-0.5 rounded text-[11px] max-w-[220px] truncate">{wh.secret.slice(0, 12)}…</code>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copySecret(wh)}>{copiedId === wh.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}</Button>
                  </div>
                  {/* Recent deliveries */}
                  <div className="rounded-lg border">
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground"><ChevronDown className="h-3.5 w-3.5" />Recent deliveries (last 10)</div>
                    <div className="max-h-52 overflow-y-auto nice-scroll">
                      <Table>
                        <TableHeader><TableRow className="bg-muted/30">
                          <TableHead className="text-xs py-2">Event</TableHead>
                          <TableHead className="text-xs py-2">Result</TableHead>
                          <TableHead className="text-xs py-2">Code</TableHead>
                          <TableHead className="text-xs py-2">Duration</TableHead>
                          <TableHead className="text-xs py-2">Time</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {wh.deliveries.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No deliveries yet</TableCell></TableRow>
                          ) : wh.deliveries.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell className="text-xs font-mono">{d.event}</TableCell>
                              <TableCell className="text-xs">{d.success ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" />Delivered</span> : <span className="inline-flex items-center gap-1 text-red-600" title={d.errorMessage}><XCircle className="h-3 w-3" />Failed</span>}</TableCell>
                              <TableCell className="text-xs font-mono">{d.statusCode || "—"}</TableCell>
                              <TableCell className="text-xs">{d.duration}ms</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(d.createdAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete webhook endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-mono text-xs">{deleteTarget?.url}</span> and its delivery history. Your server will stop receiving events immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmDelete}>Delete Endpoint</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default WebhooksPage;
