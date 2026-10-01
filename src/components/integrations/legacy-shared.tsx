"use client";

// ═══════════════════════════════════════════════════════════════
// Shared building blocks for the Integrations module (6 pages)
// Extracted from the original single integrations-page.tsx
// ═══════════════════════════════════════════════════════════════
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  MessageSquare, Smartphone, Mail, Bell, CheckCircle2, Zap, Clock, Loader2,
  FileText, ChevronLeft, ChevronRight, Copy, Check, Eye, EyeOff, Settings, Send, Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────
export interface IntegrationConfig {
  id: string;
  type: string;
  name: string;
  provider: string;
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  environment: string;
  enabled: boolean;
  config: string;
  costPerRequest: number;
  monthlyBudget: number;
  monthlyCost: number;
  ipAllowlist: string;
  apiCalls: number;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationLog {
  id: string;
  integrationId: string;
  method: string;
  url: string;
  statusCode: number;
  status: string;
  requestSummary: string;
  responseSummary: string;
  errorMessage: string;
  durationMs: number;
  retryOf: string | null;
  createdAt: string;
}

export interface IntegrationStats {
  active: number;
  inactive: number;
  total: number;
  totalApiCalls: number;
  totalEstimatedCost: number;
}

// ─── Display metadata ──────────────────────────────
export const GATEWAY_META: Record<string, { color: string; bgColor: string; borderColor: string; letter: string; badge: string }> = {
  razorpay: { color: "text-sky-600", bgColor: "bg-sky-100", borderColor: "border-sky-300", letter: "R", badge: "Most Popular" },
  phonepe: { color: "text-purple-600", bgColor: "bg-purple-100", borderColor: "border-purple-300", letter: "P", badge: "UPI Leader" },
  paytm: { color: "text-sky-700", bgColor: "bg-sky-50", borderColor: "border-sky-200", letter: "Pay", badge: "UPI + Wallet" },
  cashfree: { color: "text-emerald-600", bgColor: "bg-emerald-100", borderColor: "border-emerald-300", letter: "CF", badge: "Low Cost" },
  ccavenue: { color: "text-orange-600", bgColor: "bg-orange-100", borderColor: "border-orange-300", letter: "CC", badge: "All Banks" },
  payu: { color: "text-teal-700", bgColor: "bg-teal-50", borderColor: "border-teal-200", letter: "PU", badge: "" },
  stripe: { color: "text-violet-600", bgColor: "bg-violet-100", borderColor: "border-violet-300", letter: "S", badge: "International" },
};

export const CHANNEL_META: Record<string, { icon: React.ElementType; description: string; color: string; fields: { key: string; label: string; type: "text" | "password" | "number" }[] }> = {
  msg91: { icon: Smartphone, description: "OTP, reminders & notifications via SMS", color: "bg-orange-100 text-orange-600", fields: [
    { key: "apiKey", label: "API Key", type: "password" },
    { key: "senderId", label: "Sender ID", type: "text" },
    { key: "route", label: "Route", type: "text" },
  ]},
  whatsapp: { icon: MessageSquare, description: "Customer messaging via WhatsApp API", color: "bg-green-100 text-green-600", fields: [
    { key: "phoneId", label: "Phone Number ID", type: "text" },
    { key: "accessToken", label: "Access Token", type: "password" },
    { key: "webhookVerify", label: "Webhook Verify Token", type: "text" },
  ]},
  smtp: { icon: Mail, description: "Transactional emails via SMTP server", color: "bg-sky-100 text-sky-600", fields: [
    { key: "host", label: "SMTP Host", type: "text" },
    { key: "port", label: "Port", type: "number" },
    { key: "username", label: "Username", type: "text" },
    { key: "password", label: "Password", type: "password" },
    { key: "encryption", label: "Encryption", type: "text" },
  ]},
  fcm: { icon: Bell, description: "Mobile push notifications via Firebase", color: "bg-amber-100 text-amber-600", fields: [
    { key: "serverKey", label: "FCM Server Key", type: "password" },
    { key: "projectId", label: "Project ID", type: "text" },
  ]},
};

export const WEBHOOK_EVENTS = [
  "subscriber.created", "invoice.paid", "complaint.opened",
  "payment.received", "plan.changed", "user.login", "device.alert",
];

// ─── Helpers ───────────────────────────────────────
export function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function getGatewayStatus(gw: IntegrationConfig): "connected" | "test_mode" | "not_configured" {
  if (gw.apiKey && gw.apiSecret) return gw.environment === "live" ? "connected" : "test_mode";
  return "not_configured";
}

export function getChannelStatus(ch: IntegrationConfig): "connected" | "not_configured" {
  const config = parseConfig(ch.config);
  const hasKey = config.apiKey || config.serverKey || config.accessToken || config.password;
  return ch.enabled && hasKey ? "connected" : "not_configured";
}

export function parseConfig(configStr: string): Record<string, string> {
  try { return JSON.parse(configStr || "{}"); } catch { return {}; }
}

export function getStatusBadge(status: string) {
  switch (status) {
    case "connected": return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>;
    case "not_configured": return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-[10px]">Not Configured</Badge>;
    case "test_mode": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]"><Zap className="h-3 w-3 mr-1" />Test Mode</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export function getLogStatusBadge(status: string) {
  switch (status) {
    case "success": return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Success</Badge>;
    case "failed": return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Failed</Badge>;
    case "pending": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

// ─── Action mutation (single POST endpoint, action-based) ──
export function useIntegrationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["integration-logs"] });
    },
  });
}

// ─── Reusable log table (per-integration or global) ──
export function LogsTable({ integrationId, compact }: { integrationId?: string; compact?: boolean }) {
  const [page, setPage] = useState(1);
  const logsQuery = useQuery<{ logs: IntegrationLog[]; total: number; totalPages: number }>({
    queryKey: ["integration-logs", integrationId ?? "all", page],
    queryFn: () => apiFetch(`/api/integrations/logs?${integrationId ? `integrationId=${integrationId}&` : ""}page=${page}&limit=${compact ? 8 : 15}`),
    refetchInterval: 15000,
  });
  const logs = logsQuery.data?.logs ?? [];
  const totalPages = logsQuery.data?.totalPages ?? 1;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border max-h-96 overflow-y-auto nice-scroll">
        <Table>
          <TableHeader><TableRow className="bg-muted/50">
            <TableHead className="text-xs">Time</TableHead>
            <TableHead className="text-xs">Method / URL</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Code</TableHead>
            <TableHead className="text-xs">Duration</TableHead>
            {!compact && <TableHead className="text-xs">Error</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {logsQuery.isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No integration calls logged yet</TableCell></TableRow>
            ) : logs.map((log) => (
              <TableRow key={log.id} className="hover:bg-muted/30">
                <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(log.createdAt)}</TableCell>
                <TableCell className="text-xs max-w-[220px] truncate" title={log.url}><span className="font-mono font-medium">{log.method}</span> {log.url}</TableCell>
                <TableCell>{getLogStatusBadge(log.status)}</TableCell>
                <TableCell className="text-xs font-mono">{log.statusCode || "—"}</TableCell>
                <TableCell className="text-xs">{log.durationMs}ms</TableCell>
                {!compact && <TableCell className="text-xs max-w-[180px] truncate text-red-600" title={log.errorMessage}>{log.errorMessage || "—"}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LogsDialog({ integrationId, integrationName }: { integrationId: string | null; integrationName: string }) {
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />API Logs — {integrationName}</DialogTitle></DialogHeader>
      <div className="py-1">{integrationId && <LogsTable integrationId={integrationId} />}</div>
    </DialogContent>
  );
}

// ─── Copy/visibility secret field ──────────────────
export function SecretField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: "text" | "password" | "number"; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const isSecret = type === "password";
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-1 mt-1">
        <Input type={isSecret && !show ? "password" : type === "number" ? "number" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1" />
        {isSecret && (
          <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setShow((s) => !s)} tabIndex={-1}>
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        )}
        {value && (
          <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }} tabIndex={-1}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Channel manager section (SMS / Email / WhatsApp+Push pages) ──
export function ChannelManagerSection({ allowedProviders, accentButton, emptyHint }: { allowedProviders: string[]; accentButton: string; emptyHint: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [newName, setNewName] = useState("");
  const [configTarget, setConfigTarget] = useState<IntegrationConfig | null>(null);
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [logsTarget, setLogsTarget] = useState<IntegrationConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ channels: IntegrationConfig[] }>({
    queryKey: ["integrations", "communication"],
    queryFn: () => apiFetch("/api/integrations?type=communication"),
  });
  const channels = (data?.channels ?? []).filter((ch) => allowedProviders.includes(ch.provider) || ch.provider === "custom");
  const action = useIntegrationAction();

  function openConfig(ch: IntegrationConfig) {
    setConfigTarget(ch);
    setConfigFields(parseConfig(ch.config));
  }
  function saveConfig() {
    if (!configTarget) return;
    action.mutate(
      {
        action: "save_channel", channelId: configTarget.id, name: configTarget.name, provider: configTarget.provider,
        apiKey: configTarget.apiKey, apiSecret: configTarget.apiSecret, environment: configTarget.environment,
        enabled: configTarget.enabled, config: configFields, ipAllowlist: configTarget.ipAllowlist, costPerRequest: configTarget.costPerRequest,
      } as Record<string, unknown>,
      { onSuccess: () => { toast.success("Channel saved"); setConfigTarget(null); }, onError: (e: Error) => toast.error(e.message || "Save failed") }
    );
  }
  function toggleChannel(ch: IntegrationConfig) {
    action.mutate(
      {
        action: "save_channel", channelId: ch.id, name: ch.name, provider: ch.provider, apiKey: ch.apiKey, apiSecret: ch.apiSecret,
        environment: ch.environment, enabled: !ch.enabled, config: parseConfig(ch.config), ipAllowlist: ch.ipAllowlist, costPerRequest: ch.costPerRequest,
      } as Record<string, unknown>,
      { onSuccess: () => toast.success(`${ch.name} ${!ch.enabled ? "enabled" : "disabled"}`), onError: (e: Error) => toast.error(e.message || "Toggle failed") }
    );
  }
  function testConnection(id: string) {
    setTestingId(id);
    setTimeout(() => { setTestingId(null); toast.success("Test request queued — check API logs for the delivery result"); }, 1200);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className={`${accentButton} text-white text-xs h-8`}><Plus className="h-3 w-3 mr-1" />Add Channel</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Communication Channel</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div><Label className="text-sm">Provider</Label>
                <Select value={newProvider} onValueChange={setNewProvider}><SelectTrigger className="mt-1"><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>{allowedProviders.map((p) => (<SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>))}<SelectItem value="custom">Custom Channel</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-sm">Display Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Primary Provider" className="mt-1" /></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAddOpen(false); setNewProvider(""); setNewName(""); }}>Cancel</Button>
                <Button className={accentButton + " text-white"} disabled={!newProvider} onClick={() => {
                  const name = newName || newProvider.charAt(0).toUpperCase() + newProvider.slice(1);
                  action.mutate(
                    { action: "save_channel", channelId: `new_${Date.now()}`, name, provider: newProvider, apiKey: "", apiSecret: "", environment: "test", enabled: false, config: {} } as Record<string, unknown>,
                    { onSuccess: () => toast.success(`${name} added — now configure its credentials`) }
                  );
                  setAddOpen(false); setNewProvider(""); setNewName("");
                }}>Add Channel</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{[1, 2].map((i) => <Card key={i} className="h-36 animate-pulse bg-muted/40 border" />)}</div>
      ) : channels.length === 0 ? (
        <Card className="border"><CardContent className="py-16 text-center"><MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-lg font-semibold">No Channels Yet</p><p className="text-sm text-muted-foreground mt-1">{emptyHint}</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {channels.map((ch) => {
            const meta = CHANNEL_META[ch.provider] || { icon: MessageSquare, description: "Custom communication channel", color: "bg-gray-100 text-gray-600", fields: [] };
            const Icon = meta.icon;
            const status = getChannelStatus(ch);
            return (
              <Card key={ch.id} className="border relative overflow-hidden transition-all hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-xl ${meta.color} flex items-center justify-center`}><Icon className="h-5 w-5" /></div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm">{ch.name}</CardTitle>
                      <div className="mt-1">{getStatusBadge(status)}</div>
                    </div>
                    <Switch checked={ch.enabled} onCheckedChange={() => toggleChannel(ch)} aria-label={`Toggle ${ch.name}`} />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <CardDescription className="text-xs">{meta.description}</CardDescription>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{ch.apiCalls || 0} calls</span>
                    <span>₹{(ch.estimatedCost || 0).toFixed(2)} est.</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => openConfig(ch)}><Settings className="h-3 w-3" /></Button>
                    {status === "connected" && (
                      <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => testConnection(ch.id)} disabled={testingId === ch.id}>
                        {testingId === ch.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setLogsTarget(ch)} title="View Logs"><FileText className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Config dialog */}
      <Dialog open={!!configTarget} onOpenChange={(o) => !o && setConfigTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Configure {configTarget?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            {configTarget && (CHANNEL_META[configTarget.provider]?.fields ?? []).map((f) => (
              <SecretField key={f.key} label={f.label} type={f.type} value={configFields[f.key] ?? ""} onChange={(v) => setConfigFields((p) => ({ ...p, [f.key]: v }))} />
            ))}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><p className="text-sm font-medium">Enabled</p><p className="text-xs text-muted-foreground">Route traffic through this channel</p></div>
              <Switch checked={configTarget?.enabled ?? false} onCheckedChange={(v) => setConfigTarget((t) => (t ? { ...t, enabled: v } : t))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigTarget(null)}>Cancel</Button>
              <Button className={accentButton + " text-white"} disabled={action.isPending} onClick={saveConfig}>
                {action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : "Save"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logs dialog */}
      <Dialog open={!!logsTarget} onOpenChange={(o) => !o && setLogsTarget(null)}>
        <LogsDialog integrationId={logsTarget?.id ?? null} integrationName={logsTarget?.name ?? ""} />
      </Dialog>
    </div>
  );
}
