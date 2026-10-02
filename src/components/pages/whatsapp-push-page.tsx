"use client";

// ═══════════════════════════════════════════════════════════════
// WhatsApp & Push Notifications — WhatsApp Business API (Cloud /
// Twilio / Gupshup) + Push providers (FCM / OneSignal / Web Push).
// Real credential verification (/api/integrations/test) and REAL
// test sends (/api/integrations/send). Configs persist as
// type="communication" rows, filtered client-side by provider kind.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import {
  Bell, MessageSquare, Plus, Settings, Send, Save, Loader2, Info,
  Activity, AlertCircle, CheckCircle2, Layers, Zap, LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  KIND_META, getProvider, providersByKind,
  type ProviderKind, type ProviderMeta, type IntegrationConfigRow,
  type IntegrationLogRow, type AdapterTestResult,
} from "@/lib/integrations/client-types";
import {
  ProviderChip, EnvironmentPill, EnabledPill, TestResultBanner, DynamicConfigFields,
  validateProviderFields, DocsLink, AsyncActionButton, MiniStat, WarningStrip, EnabledSwitch,
} from "@/components/integrations/shared";

// ─── Local helpers (page-scoped, keep shared kit untouched) ────

function parseStoredConfig(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** Split dialog values into the flat config the adapters expect
 *  (topLevel fields → apiKey/apiSecret/merchantId, rest → config JSON keys). */
function flatConfig(meta: ProviderMeta, values: Record<string, string>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const f of meta.fields) {
    const v = values[f.key] ?? "";
    if (f.topLevel) flat[f.topLevel] = v;
    else flat[f.key] = v;
  }
  return flat;
}

/** Textarea fields (e.g. FCM serviceAccountJson) must be valid JSON. */
function firstJsonError(meta: ProviderMeta, values: Record<string, string>): string | null {
  for (const f of meta.fields) {
    if (f.type !== "textarea") continue;
    const v = (values[f.key] ?? "").trim();
    if (!v || v.startsWith("••••")) continue; // masked / empty → nothing to validate
    try {
      JSON.parse(v);
    } catch (err) {
      return `${f.label} is not valid JSON — ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return null;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function methodBadgeClass(method: string): string {
  if (method === "TEST") return "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300";
  if (method === "SEND") return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  return "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400";
}

function statusBadgeClass(status: string): string {
  if (status === "success") return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "failed") return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300";
  if (status === "pending") return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400";
}

const SECTION_ICONS: Record<"whatsapp" | "push", LucideIcon> = {
  whatsapp: MessageSquare,
  push: Bell,
};

const SECTIONS: { kind: "whatsapp" | "push"; title: string; blurb: string }[] = [
  { kind: "whatsapp", title: "WhatsApp Business", blurb: "Official WhatsApp Business API providers — verify numbers, templates and the 24h customer window." },
  { kind: "push", title: "Push Notifications", blurb: "Mobile & browser push providers — topic sends, segments and Web Push credentials." },
];

const MASKED_PREFIX = "••••";

export function WhatsappPushPage() {
  // ── Data ──
  const [channels, setChannels] = useState<IntegrationConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activity, setActivity] = useState<IntegrationLogRow[]>([]);

  // ── Provider picker ──
  const [pickOpen, setPickOpen] = useState(false);

  // ── Config dialog ──
  const [configDialog, setConfigDialog] = useState<{ provider: ProviderMeta; channel: IntegrationConfigRow | null } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [environment, setEnvironment] = useState("test");
  const [enabled, setEnabled] = useState(false);
  const [costPerRequest, setCostPerRequest] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<AdapterTestResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Card actions ──
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [cardTestId, setCardTestId] = useState<string | null>(null);

  // ── Send-test dialog ──
  const [sendDialog, setSendDialog] = useState<{ channel: IntegrationConfigRow; provider: ProviderMeta } | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sendResult, setSendResult] = useState<AdapterTestResult | null>(null);
  const [sending, setSending] = useState(false);

  // ── Loads ──
  const loadChannels = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<{ channels: IntegrationConfigRow[] }>("/api/integrations?type=communication");
      setChannels(Array.isArray(data.channels) ? data.channels : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load channels";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const data = await apiFetch<{ logs: IntegrationLogRow[] }>("/api/integrations/logs?limit=200&page=1");
      setActivity(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      // activity feed is non-fatal
    }
  }, []);

  useEffect(() => {
    void loadChannels();
    void loadActivity();
  }, [loadChannels, loadActivity]);

  // ── Derived ──
  const channelIds = new Set(channels.map((c) => c.id));
  const recentActivity = activity.filter((l) => channelIds.has(l.integrationId)).slice(0, 8);
  const configuredProviderIds = new Set(channels.map((c) => c.provider));
  const channelsOf = (kind: ProviderKind) => channels.filter((c) => getProvider(c.provider)?.kind === kind);
  const totalApiCalls = channels.reduce((s, c) => s + (c.apiCalls || 0), 0);
  const activeCount = channels.filter((c) => c.enabled).length;
  const availableCount = providersByKind("whatsapp").length + providersByKind("push").length;

  // ── Dialog openers ──
  function seedForm(meta: ProviderMeta, channel: IntegrationConfigRow | null) {
    const stored = parseStoredConfig(channel?.config ?? null);
    const init: Record<string, string> = {};
    for (const f of meta.fields) {
      if (f.topLevel === "apiKey") init[f.key] = channel?.apiKey ?? "";
      else if (f.topLevel === "apiSecret") init[f.key] = channel?.apiSecret ?? "";
      else if (f.topLevel === "merchantId") init[f.key] = channel?.merchantId ?? "";
      else init[f.key] = String(stored[f.key] ?? f.defaultValue ?? "");
    }
    setValues(init);
    setDisplayName(channel?.name ?? meta.name);
    setEnvironment(channel?.environment || "test");
    setEnabled(channel?.enabled ?? false);
    setCostPerRequest(String(channel?.costPerRequest ?? 0));
    setFormError(null);
    setJsonError(null);
    setVerifyResult(null);
  }

  function openNew(provider: ProviderMeta) {
    setConfigDialog({ provider, channel: null });
    seedForm(provider, null);
    setPickOpen(false);
  }

  function openConfig(channel: IntegrationConfigRow) {
    const meta = getProvider(channel.provider);
    if (!meta) {
      toast.error(`Unknown provider "${channel.provider}"`);
      return;
    }
    setConfigDialog({ provider: meta, channel });
    seedForm(meta, channel);
  }

  function onFieldChange(key: string, value: string, field: Parameters<React.ComponentProps<typeof DynamicConfigFields>["onChange"]>[2]) {
    setValues((v) => ({ ...v, [key]: value }));
    setFormError(null);
    if (field.type === "textarea") setJsonError(null);
  }

  function runValidation(): string | null {
    const d = configDialog;
    if (!d) return null;
    const requiredErr = validateProviderFields(d.provider.fields, values);
    if (requiredErr) return requiredErr;
    const jsonErr = firstJsonError(d.provider, values);
    setJsonError(jsonErr);
    return jsonErr ?? null;
  }

  // ── Actions ──
  async function verifyCredentials() {
    const d = configDialog;
    if (!d || verifying) return;
    const err = runValidation();
    if (err) {
      setFormError(err);
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      // Saved rows verify server-stored credentials via configId; new/unsaved
      // forms verify inline via provider + flat config.
      const body = d.channel
        ? { configId: d.channel.id }
        : { provider: d.provider.id, config: flatConfig(d.provider, values) };
      const data = await apiFetch<{ result: AdapterTestResult }>("/api/integrations/test", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setVerifyResult(data.result ?? null);
      if (data.result?.ok) toast.success(data.result.message);
      else toast.error(data.result?.message || "Verification failed");
      void loadActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  }

  async function saveProvider() {
    const d = configDialog;
    if (!d || saving) return;
    const err = runValidation();
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    try {
      const config: Record<string, string> = {};
      const body: Record<string, unknown> = {
        action: "save_channel",
        channelId: d.channel?.id,
        name: displayName.trim() || d.provider.name,
        provider: d.provider.id,
        environment,
        enabled,
        costPerRequest: parseFloat(costPerRequest) || 0,
      };
      for (const f of d.provider.fields) {
        const v = values[f.key] ?? "";
        if (f.topLevel) body[f.topLevel] = v; // masked values pass through — backend preserves stored secrets
        else config[f.key] = v;
      }
      body.config = config;
      await apiFetch("/api/integrations", { method: "POST", body: JSON.stringify(body) });
      toast.success(`${String(body.name)} saved`);
      setConfigDialog(null);
      await loadChannels();
      void loadActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleChannel(channel: IntegrationConfigRow) {
    if (togglingId) return;
    setTogglingId(channel.id);
    try {
      await apiFetch("/api/integrations", {
        method: "POST",
        body: JSON.stringify({
          action: "save_channel",
          channelId: channel.id,
          name: channel.name,
          provider: channel.provider,
          apiKey: channel.apiKey, // masked — backend preserves stored secrets
          apiSecret: channel.apiSecret,
          environment: channel.environment,
          enabled: !channel.enabled,
          config: parseStoredConfig(channel.config),
          costPerRequest: channel.costPerRequest,
        }),
      });
      toast.success(`${channel.name} ${channel.enabled ? "disabled" : "enabled"}`);
      await loadChannels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setTogglingId(null);
    }
  }

  async function testChannel(channel: IntegrationConfigRow) {
    if (cardTestId) return;
    setCardTestId(channel.id);
    try {
      const data = await apiFetch<{ result: AdapterTestResult }>("/api/integrations/test", {
        method: "POST",
        body: JSON.stringify({ configId: channel.id }),
      });
      const r = data.result;
      if (r?.ok) toast.success(`${r.message} (${r.latencyMs} ms)`);
      else toast.error(r?.message || "Test failed");
      void loadActivity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setCardTestId(null);
    }
  }

  function openSend(channel: IntegrationConfigRow) {
    const meta = getProvider(channel.provider);
    if (!meta) return;
    setSendDialog({ channel, provider: meta });
    setSendTo(meta.kind === "push" ? "test" : "");
    setSendBody("Test message from CryptSK Nexus");
    setSendResult(null);
  }

  async function submitSend() {
    const d = sendDialog;
    if (!d || sending) return;
    if (!sendTo.trim()) {
      toast.error(d.provider.kind === "push" ? "Topic / recipient is required" : "Phone number is required");
      return;
    }
    if (!sendBody.trim()) {
      toast.error("Message is required");
      return;
    }
    setSending(true);
    try {
      const data = await apiFetch<{ result: AdapterTestResult }>("/api/integrations/send", {
        method: "POST",
        body: JSON.stringify({ configId: d.channel.id, to: sendTo.trim(), message: sendBody }),
      });
      setSendResult(data.result ?? null);
      if (data.result?.ok) toast.success(data.result.message);
      else toast.error(data.result?.message || "Send failed");
      void loadActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed";
      setSendResult({ ok: false, message: msg, latencyMs: 0, testedAt: new Date().toISOString() });
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  function sendHelperText(provider: ProviderMeta): string {
    if (provider.kind === "push") {
      if (provider.id === "onesignal") return "Delivered to the 'Subscribed Users' segment of your OneSignal app.";
      return "Sent to 'test' topic — point devices at it to receive.";
    }
    return "Phone number in E.164 format, e.g. +919876543210.";
  }

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
            WhatsApp &amp; Push Notifications
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Official WhatsApp Business API and push providers — verify numbers, send test messages and pushes.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 bg-green-600 text-xs text-white hover:bg-green-700" onClick={() => setPickOpen(true)}>
          <Plus className="h-3.5 w-3.5" />Add Provider
        </Button>
      </div>

      {/* Stats strip */}
      <Card className="border shadow-sm">
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <MiniStat label="Connected" value={String(channels.length)} icon={<Layers className="h-3 w-3" />} />
          <MiniStat label="Active" value={String(activeCount)} tone={activeCount > 0 ? "good" : "default"} icon={<CheckCircle2 className="h-3 w-3" />} />
          <MiniStat label="API Calls" value={String(totalApiCalls)} icon={<Activity className="h-3 w-3" />} />
          <MiniStat label="Providers Available" value={String(availableCount)} icon={<Zap className="h-3 w-3" />} />
        </CardContent>
      </Card>

      {/* Load states */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : loadError ? (
        <Card className="border border-red-200 dark:border-red-900/60">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm font-medium">Failed to load communication channels</p>
            <p className="max-w-md text-xs text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void loadChannels()}>
              <Loader2 className="h-3.5 w-3.5" />Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {SECTIONS.map((section) => {
            const Icon = SECTION_ICONS[section.kind];
            const kindChannels = channelsOf(section.kind);
            const kindProviders = providersByKind(section.kind);
            return (
              <section key={section.kind} className="space-y-3" aria-label={section.title}>
                {/* Section sub-header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${KIND_META[section.kind].color}`} aria-hidden />
                    <h2 className="text-sm font-semibold">{section.title}</h2>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{kindChannels.length} connected</Badge>
                  </div>
                  <p className="hidden text-xs text-muted-foreground md:block">{section.blurb}</p>
                </div>

                {/* Connected cards */}
                {kindChannels.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    No providers connected yet — set one up from the catalogue below.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {kindChannels.map((channel) => {
                      const meta = getProvider(channel.provider);
                      if (!meta) return null;
                      return (
                        <Card key={channel.id} className="border shadow-sm transition-all hover:shadow-md">
                          <CardContent className="space-y-3 p-4">
                            <div className="flex items-start gap-3">
                              <ProviderChip provider={meta} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold" title={channel.name}>{channel.name}</p>
                                <p className="text-[11px] text-muted-foreground">{meta.name}</p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <EnvironmentPill environment={channel.environment} />
                                  <EnabledPill enabled={channel.enabled} />
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {meta.capabilities.slice(0, 4).map((cap) => (
                                <Badge key={cap} variant="secondary" className="px-1.5 text-[10px] font-normal">{cap}</Badge>
                              ))}
                            </div>
                            <div className="flex items-center justify-between border-t pt-2.5 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" />{channel.apiCalls || 0} API calls</span>
                              <DocsLink url={meta.docsUrl} />
                            </div>
                            <div className="flex items-center justify-between gap-2 border-t pt-2.5">
                              <EnabledSwitch
                                checked={channel.enabled}
                                onChange={() => void toggleChannel(channel)}
                                disabled={togglingId === channel.id}
                                ariaLabel={`Toggle ${channel.name}`}
                              />
                              <div className="flex gap-1.5">
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={`Configure ${channel.name}`} title="Configure" onClick={() => openConfig(channel)}>
                                  <Settings className="h-3.5 w-3.5" />
                                </Button>
                                <AsyncActionButton
                                  label="Test"
                                  pendingLabel="Testing"
                                  pending={cardTestId === channel.id}
                                  onClick={() => void testChannel(channel)}
                                />
                                {meta.sendable && (
                                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openSend(channel)} title="Send test message">
                                    <Send className="h-3.5 w-3.5" />Send Test
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Available provider catalogue */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {kindProviders.map((provider) => {
                    const configured = configuredProviderIds.has(provider.id);
                    return (
                      <Card key={provider.id} className="border-dashed shadow-none">
                        <CardContent className="space-y-2.5 p-4">
                          <div className="flex items-start gap-3">
                            <ProviderChip provider={provider} size="lg" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-medium">{provider.name}</p>
                                {configured && (
                                  <Badge variant="outline" className="h-5 border-emerald-300 bg-emerald-50 px-1.5 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    Configured
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground" title={provider.description}>{provider.description}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {provider.capabilities.slice(0, 4).map((cap) => (
                              <Badge key={cap} variant="secondary" className="px-1.5 text-[10px] font-normal">{cap}</Badge>
                            ))}
                            {!provider.sendable && (
                              <Badge variant="outline" className="px-1.5 text-[10px] font-normal">Credentials only — no test send</Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between border-t pt-2.5">
                            <DocsLink url={provider.docsUrl} />
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openNew(provider)}>
                              <Plus className="h-3.5 w-3.5" />{configured ? "Add instance" : "Set up"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* Recent activity */}
          <Card className="border">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Recent Activity</h2>
                <span className="text-xs text-muted-foreground">last {recentActivity.length} calls from your WhatsApp &amp; push providers</span>
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Channel</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Duration</TableHead>
                      <TableHead className="text-xs">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentActivity.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                          No API calls yet — run a credential test or send a test message.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentActivity.map((log) => (
                        <TableRow key={log.id} className="hover:bg-muted/30">
                          <TableCell className="max-w-[180px] truncate text-xs font-medium" title={channelName(log.integrationId)}>{channelName(log.integrationId)}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className={`text-[10px] ${methodBadgeClass(log.method)}`}>{log.method}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(log.status)}`}>{log.status}</Badge>
                            <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{log.statusCode || "—"}</span>
                          </TableCell>
                          <TableCell className="text-xs">{log.durationMs} ms</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground" title={new Date(log.createdAt).toLocaleString()}>{timeAgo(log.createdAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Provider picker dialog ── */}
      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Provider</DialogTitle>
            <DialogDescription>Pick a WhatsApp Business or push provider to configure.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1 nice-scroll">
            {SECTIONS.map((section) => (
              <div key={section.kind} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
                <div className="space-y-2">
                  {providersByKind(section.kind).map((provider) => (
                    <div key={provider.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                      <ProviderChip provider={provider} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{provider.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{provider.description}</p>
                      </div>
                      {configuredProviderIds.has(provider.id) && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Configured</Badge>
                      )}
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openNew(provider)}>
                        Select
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Config dialog ── */}
      <Dialog open={!!configDialog} onOpenChange={(open) => !open && setConfigDialog(null)}>
        <DialogContent className="max-w-xl">
          {configDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ProviderChip provider={configDialog.provider} size="sm" />
                  {configDialog.channel ? `Configure ${configDialog.provider.name}` : `Add ${configDialog.provider.name}`}
                </DialogTitle>
                <DialogDescription>{configDialog.provider.description}</DialogDescription>
              </DialogHeader>
              <div className="grid max-h-[62vh] gap-4 overflow-y-auto py-1 pr-1 nice-scroll">
                {configDialog.channel && (
                  <WarningStrip>
                    Stored secrets are masked ({MASKED_PREFIX}last4). Leave masked fields as-is to keep the saved credential, or paste a new value to replace it.
                  </WarningStrip>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="channel-name" className="text-xs">Display Name</Label>
                  <Input id="channel-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={configDialog.provider.name} />
                </div>

                <DynamicConfigFields
                  fields={configDialog.provider.fields}
                  values={values}
                  onChange={onFieldChange}
                  disabled={saving || verifying}
                />
                {jsonError && (
                  <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{jsonError}</p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Environment</Label>
                    <Select value={environment} onValueChange={setEnvironment} disabled={saving || verifying}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="test">Test (sandbox)</SelectItem>
                        <SelectItem value="live">Live (production)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="channel-cost" className="text-xs">Cost per request (₹)</Label>
                    <Input id="channel-cost" type="number" step="0.01" min="0" value={costPerRequest} onChange={(e) => setCostPerRequest(e.target.value)} className="h-9" />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Enabled</p>
                    <p className="text-xs text-muted-foreground">Allow this provider to send messages and pushes</p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Toggle enabled" />
                </div>

                {configDialog.provider.setupNotes && configDialog.provider.setupNotes.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium"><Info className="h-3.5 w-3.5" />Setup notes</p>
                    <ul className="list-inside list-disc space-y-1 text-[11px] text-muted-foreground">
                      {configDialog.provider.setupNotes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                  </div>
                )}

                <div className="space-y-2 border-t pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Verify Credentials</p>
                      <p className="text-xs text-muted-foreground">
                        {configDialog.channel
                          ? "Runs a real API call against the stored credentials — save new keys first, then verify."
                          : "Runs a real API call with the values entered above — nothing is saved."}
                      </p>
                    </div>
                    <AsyncActionButton
                      label="Verify"
                      pendingLabel="Verifying"
                      pending={verifying}
                      onClick={() => void verifyCredentials()}
                    />
                  </div>
                  <TestResultBanner result={verifyResult} />
                </div>

                {formError && (
                  <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{formError}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfigDialog(null)} disabled={saving}>Cancel</Button>
                <Button className="gap-1.5 bg-green-600 text-white hover:bg-green-700" onClick={() => void saveProvider()} disabled={saving || verifying}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Provider
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Send-test dialog ── */}
      <Dialog open={!!sendDialog} onOpenChange={(open) => !open && setSendDialog(null)}>
        <DialogContent className="max-w-md">
          {sendDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ProviderChip provider={sendDialog.provider} size="sm" />
                  Send Test via {sendDialog.provider.name}
                </DialogTitle>
                <DialogDescription>
                  {sendDialog.provider.kind === "push"
                    ? "Delivers a real push notification through this provider."
                    : "Delivers a real WhatsApp text message through this provider."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-1">
                {!sendDialog.channel.enabled && (
                  <WarningStrip>This provider is disabled — enable it (toggle on the card) before sending.</WarningStrip>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="send-to" className="text-xs">{sendDialog.provider.kind === "push" ? "Topic / Recipient" : "To (phone number)"}</Label>
                  <Input
                    id="send-to"
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    placeholder={sendDialog.provider.kind === "push" ? "test" : "+9198…"}
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">{sendHelperText(sendDialog.provider)}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="send-message" className="text-xs">Message</Label>
                  <Textarea id="send-message" rows={4} value={sendBody} onChange={(e) => setSendBody(e.target.value)} placeholder="Hello from CryptSK Nexus!" />
                </div>
                <TestResultBanner result={sendResult} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSendDialog(null)} disabled={sending}>Cancel</Button>
                <AsyncActionButton
                  label="Send"
                  pendingLabel="Sending"
                  pending={sending}
                  variant="default"
                  disabled={!sendDialog.channel.enabled || !sendTo.trim() || !sendBody.trim()}
                  icon={<Send className="h-3.5 w-3.5" />}
                  onClick={() => void submitSend()}
                  className="bg-green-600 text-white hover:bg-green-700"
                />
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WhatsappPushPage;
