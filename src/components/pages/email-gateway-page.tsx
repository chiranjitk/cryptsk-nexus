"use client";

// ═══════════════════════════════════════════════════════════════
// Email Gateway Management — SMTP + email API provider catalog
// Stats → Connected Providers → Available Providers → API Logs
// Mirrors payment-gateways-page.tsx structure and density.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, AlertCircle, Clock3, DollarSign, ExternalLink, Loader2, Mail,
  Plus, RefreshCw, Save, ScrollText, Send, Settings, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiFetch, cn } from "@/lib/utils";
import {
  providersByKind, getProvider,
  type ProviderKind, type ProviderMeta, type ProviderField,
  type IntegrationConfigRow, type IntegrationLogRow, type AdapterTestResult,
} from "@/lib/integrations/client-types";
import {
  ProviderChip, EnvironmentPill, EnabledPill, TestResultBanner, DynamicConfigFields,
  validateProviderFields, DocsLink, AsyncActionButton, MiniStat, WarningStrip, EnabledSwitch,
} from "@/components/integrations/shared";

// ─── Page-level constants ─────────────────────────────────────
const KIND: ProviderKind = "email";
const CATALOG = providersByKind(KIND);
const DOCS_URL = CATALOG[0]?.docsUrl ?? "#";
const TEST_MESSAGE = "Test message from CryptSK Nexus — integration verified.";
const TEST_SUBJECT = "CryptSK Nexus — Test Email";
const LOG_FETCH_LIMIT = 100;

// ─── Local helpers ────────────────────────────────────────────
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function parseConfig(config: string | null): Record<string, string> {
  if (!config) return {};
  try {
    const parsed: unknown = JSON.parse(config);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** Split dynamic field values into the flat map the adapters expect:
 *  topLevel fields land on apiKey/apiSecret/merchantId, the rest pass through. */
function buildFlatConfig(provider: ProviderMeta, values: Record<string, string>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const f of provider.fields) {
    const v = values[f.key] ?? "";
    if (f.topLevel) flat[f.topLevel] = v;
    else flat[f.key] = v;
  }
  return flat;
}

// ─── Small presentational building blocks ─────────────────────
function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: "default" | "good" | "bad" | "warn" }) {
  return (
    <Card className="border bg-card shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70">
          {icon}
        </div>
        <MiniStat label={label} value={value} tone={tone} />
      </CardContent>
    </Card>
  );
}

function CapabilityBadges({ items, max = 3 }: { items: string[]; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, max).map((c) => (
        <Badge key={c} variant="outline" className="h-5 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
          {c}
        </Badge>
      ))}
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 px-1.5 py-0 text-[10px]",
        method === "TEST"
          ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
          : "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300",
      )}
    >
      {method}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return <Badge variant="outline" className="h-5 border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">success</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="outline" className="h-5 border-red-300 bg-red-50 px-1.5 py-0 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">failed</Badge>;
  }
  return <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px] text-muted-foreground">{status || "—"}</Badge>;
}

// ─── Main page ────────────────────────────────────────────────
export function EmailGatewayPage() {
  // ── data ──
  const [channels, setChannels] = useState<IntegrationConfigRow[] | null>(null); // null = loading
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<IntegrationLogRow[] | null>(null);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── per-card verification results ──
  const [cardResults, setCardResults] = useState<Record<string, AdapterTestResult>>({});
  const [cardTestingId, setCardTestingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── add-provider picker ──
  const [addOpen, setAddOpen] = useState(false);
  const [addProviderId, setAddProviderId] = useState("");

  // ── config dialog ──
  const [dialogProvider, setDialogProvider] = useState<ProviderMeta | null>(null);
  const [editing, setEditing] = useState<IntegrationConfigRow | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [environment, setEnvironment] = useState("test");
  const [enabled, setEnabled] = useState(false);
  const [costPerRequest, setCostPerRequest] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AdapterTestResult | null>(null);
  const [saving, setSaving] = useState(false);

  // ── send-test dialog ──
  const [sendTarget, setSendTarget] = useState<IntegrationConfigRow | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendSubject, setSendSubject] = useState(TEST_SUBJECT);
  const [sendMessage, setSendMessage] = useState(TEST_MESSAGE);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<AdapterTestResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // ── logs filter ──
  const [logStatus, setLogStatus] = useState<"all" | "success" | "failed">("all");

  // ── derived (client-side kind filtering: type=communication holds sms+email+whatsapp) ──
  const kindConfigs = useMemo(
    () => (channels ?? []).filter((c) => getProvider(c.provider)?.kind === KIND),
    [channels],
  );
  const configIds = useMemo(() => new Set(kindConfigs.map((c) => c.id)), [kindConfigs]);
  const kindLogs = useMemo(
    () => (logs ?? []).filter((l) => configIds.has(l.integrationId)),
    [logs, configIds],
  );
  const filteredLogs = useMemo(
    () => (logStatus === "all" ? kindLogs : kindLogs.filter((l) => l.status === logStatus)),
    [kindLogs, logStatus],
  );

  const activeCount = kindConfigs.filter((c) => c.enabled).length;
  const totalApiCalls = kindConfigs.reduce((s, c) => s + (c.apiCalls || 0), 0);
  const totalCost = kindConfigs.reduce((s, c) => s + (c.estimatedCost || 0), 0);
  const lastTestAt = useMemo(() => {
    // logs arrive newest-first from the API; find the most recent successful TEST
    for (const l of kindLogs) {
      if (l.method === "TEST" && l.status === "success") return l.createdAt;
    }
    return null;
  }, [kindLogs]);

  // ── data loading ──
  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setChannelsError(null);
    setLogsError(null);
    try {
      const data = await apiFetch<{ channels: IntegrationConfigRow[] }>("/api/integrations?type=communication");
      setChannels(data.channels ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load integrations";
      setChannelsError(msg);
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
    try {
      const data = await apiFetch<{ logs: IntegrationLogRow[]; pagination?: { total?: number } }>(
        `/api/integrations/logs?limit=${LOG_FETCH_LIMIT}`,
      );
      setLogs(data.logs ?? []);
      setLogsTotal(data.pagination?.total ?? data.logs?.length ?? 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load API logs";
      setLogsError(msg);
      toast.error(msg);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── dialog open/close ──
  function openNewConfig(provider: ProviderMeta) {
    setDialogProvider(provider);
    setEditing(null);
    const values: Record<string, string> = {};
    for (const f of provider.fields) values[f.key] = f.defaultValue ?? "";
    setFieldValues(values);
    setDisplayName(provider.name);
    setEnvironment("test");
    setEnabled(false);
    setCostPerRequest("0");
    setFormError(null);
    setVerifyResult(null);
    setAddOpen(false);
  }

  function openEditConfig(row: IntegrationConfigRow) {
    const provider = getProvider(row.provider);
    if (!provider) {
      toast.error(`Unknown provider "${row.provider}" — cannot configure`);
      return;
    }
    setDialogProvider(provider);
    setEditing(row);
    const parsed = parseConfig(row.config);
    const values: Record<string, string> = {};
    for (const f of provider.fields) {
      values[f.key] = f.topLevel ? (row[f.topLevel] ?? "") : (parsed[f.key] ?? f.defaultValue ?? "");
    }
    setFieldValues(values);
    setDisplayName(row.name);
    setEnvironment(row.environment || "test");
    setEnabled(row.enabled);
    setCostPerRequest(String(row.costPerRequest ?? 0));
    setFormError(null);
    setVerifyResult(null);
  }

  function closeConfig() {
    setDialogProvider(null);
    setEditing(null);
    setVerifyResult(null);
    setFormError(null);
  }

  function handleFieldChange(key: string, value: string, _field: ProviderField) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  // ── actions ──
  async function verifyCredentials() {
    if (!dialogProvider) return;
    const validation = validateProviderFields(dialogProvider.fields, fieldValues);
    if (validation) {
      setFormError(validation);
      toast.error(validation);
      return;
    }
    setFormError(null);
    setVerifying(true);
    setVerifyResult(null);
    try {
      const data = await apiFetch<{ result: AdapterTestResult }>("/api/integrations/test", {
        method: "POST",
        body: JSON.stringify({ provider: dialogProvider.id, config: buildFlatConfig(dialogProvider, fieldValues) }),
      });
      setVerifyResult(data.result ?? null);
      if (data.result?.ok) toast.success("Credentials verified");
      else toast.error(data.result?.message || "Verification failed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification request failed";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  }

  async function saveProvider() {
    if (!dialogProvider) return;
    const validation = validateProviderFields(dialogProvider.fields, fieldValues);
    if (validation) {
      setFormError(validation);
      toast.error(validation);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const flat = buildFlatConfig(dialogProvider, fieldValues);
      const config: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat)) {
        if (k !== "apiKey" && k !== "apiSecret" && k !== "merchantId") config[k] = v;
      }
      await apiFetch("/api/integrations", {
        method: "POST",
        body: JSON.stringify({
          action: "save_channel",
          channelId: editing?.id,
          name: displayName.trim() || dialogProvider.name,
          provider: dialogProvider.id,
          apiKey: flat.apiKey ?? "",
          apiSecret: flat.apiSecret ?? "",
          environment,
          enabled,
          config,
          costPerRequest: Number(costPerRequest) || 0,
        }),
      });
      toast.success(`${displayName.trim() || dialogProvider.name} saved`);
      closeConfig();
      void fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleChannel(row: IntegrationConfigRow) {
    setTogglingId(row.id);
    try {
      await apiFetch("/api/integrations", {
        method: "POST",
        body: JSON.stringify({
          action: "save_channel",
          channelId: row.id,
          name: row.name,
          provider: row.provider,
          apiKey: row.apiKey,
          apiSecret: row.apiSecret,
          environment: row.environment,
          enabled: !row.enabled,
          ipAllowlist: row.ipAllowlist,
          costPerRequest: row.costPerRequest,
          // config omitted → backend preserves the stored JSON blob
        }),
      });
      toast.success(`${row.name} ${row.enabled ? "disabled" : "enabled"}`);
      setChannels((prev) =>
        prev ? prev.map((c) => (c.id === row.id ? { ...c, enabled: !row.enabled } : c)) : prev,
      );
      void fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Toggle failed";
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
  }

  async function testSaved(row: IntegrationConfigRow) {
    setCardTestingId(row.id);
    try {
      const data = await apiFetch<{ result: AdapterTestResult }>("/api/integrations/test", {
        method: "POST",
        body: JSON.stringify({ configId: row.id }),
      });
      setCardResults((prev) => ({ ...prev, [row.id]: data.result }));
      if (data.result?.ok) toast.success(`${row.name}: ${data.result.message}`);
      else toast.error(`${row.name}: ${data.result?.message || "verification failed"}`);
      void fetchData(); // apiCalls incremented server-side
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification request failed";
      toast.error(msg);
    } finally {
      setCardTestingId(null);
    }
  }

  function openSendDialog(row: IntegrationConfigRow) {
    setSendTarget(row);
    setSendTo("");
    setSendSubject(TEST_SUBJECT);
    setSendMessage(TEST_MESSAGE);
    setSendResult(null);
    setSendError(null);
  }

  async function sendTestMessage() {
    const row = sendTarget;
    if (!row) return;
    if (!sendTo.trim()) {
      setSendError("Recipient email address is required");
      return;
    }
    if (!sendTo.includes("@")) {
      setSendError("Enter a valid email address (must contain @)");
      return;
    }
    if (!sendMessage.trim()) {
      setSendError("Message body is required");
      return;
    }
    setSendError(null);
    setSending(true);
    setSendResult(null);
    try {
      const data = await apiFetch<{ result: AdapterTestResult }>("/api/integrations/send", {
        method: "POST",
        body: JSON.stringify({
          configId: row.id,
          to: sendTo.trim(),
          message: sendMessage,
          subject: sendSubject.trim() || TEST_SUBJECT,
        }),
      });
      setSendResult(data.result ?? null);
      if (data.result?.ok) toast.success(`Test email sent to ${sendTo.trim()}`);
      else toast.error(data.result?.message || "Send failed");
      void fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send request failed";
      setSendError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  // ── render ──
  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Email Gateway
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            SMTP and email API providers — verify credentials and send test emails.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Provider Docs <ExternalLink className="h-3 w-3" />
          </a>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Add Provider
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap bg-muted p-1">
          <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
            <Mail className="h-3.5 w-3.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5 text-xs sm:text-sm">
            <ScrollText className="h-3.5 w-3.5" />API Logs
          </TabsTrigger>
        </TabsList>

        {/* ════════════════ Overview tab ════════════════ */}
        <TabsContent value="overview" className="space-y-6">
          {/* ── Stats row ── */}
          <section aria-label="Email gateway statistics" className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={<Mail className="h-4 w-4" />}
                label="Active Providers"
                value={`${activeCount}/${kindConfigs.length}`}
                tone={activeCount > 0 ? "good" : "default"}
              />
              <StatCard
                icon={<Activity className="h-4 w-4" />}
                label="Total API Calls"
                value={totalApiCalls.toLocaleString()}
              />
              <StatCard
                icon={<DollarSign className="h-4 w-4" />}
                label="Est. Cost"
                value={`$${totalCost.toFixed(2)}`}
                tone="warn"
              />
              <StatCard
                icon={<Clock3 className="h-4 w-4" />}
                label="Last Test"
                value={lastTestAt ? timeAgo(lastTestAt) : "Never"}
                tone={lastTestAt ? "good" : "warn"}
              />
            </div>
          </section>

          {/* ── Connected Providers ── */}
          <section aria-label="Connected email providers" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                Connected Providers
                <Badge variant="secondary" className="text-[10px]">{kindConfigs.length}</Badge>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => void fetchData()}
                disabled={refreshing}
                aria-label="Refresh integrations"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {channelsError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {channelsError}
                </span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void fetchData()}>
                  Retry
                </Button>
              </div>
            )}

            {channels === null ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-48 rounded-xl" />
                ))}
              </div>
            ) : kindConfigs.length === 0 ? (
              <Card className="border bg-card">
                <CardContent className="py-14 text-center">
                  <Mail className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-semibold">No email providers connected</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pick a provider from the catalog below — credentials are verified with a real SMTP handshake or API call before you go live.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {kindConfigs.map((row) => {
                  const meta = getProvider(row.provider);
                  const chipMeta = meta ?? {
                    badge: row.provider.slice(0, 2).toUpperCase(),
                    color: "bg-muted text-muted-foreground",
                    name: row.provider,
                  };
                  return (
                    <Card key={row.id} className="border bg-card shadow-sm transition-shadow hover:shadow-md">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <ProviderChip provider={chipMeta} />
                          <div className="min-w-0 flex-1">
                            <CardTitle className="truncate text-sm">{row.name}</CardTitle>
                            <CardDescription className="truncate text-xs">{meta?.name ?? row.provider}</CardDescription>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <EnvironmentPill environment={row.environment} />
                            <EnabledPill enabled={row.enabled} />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <CapabilityBadges items={meta?.capabilities ?? []} />
                        <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            {row.apiCalls || 0} API calls
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />${(row.estimatedCost || 0).toFixed(2)} est.
                          </span>
                        </div>
                        <TestResultBanner result={cardResults[row.id] ?? null} />
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => openEditConfig(row)}
                              aria-label={`Configure ${row.name}`}
                            >
                              <Settings className="h-3.5 w-3.5" />Configure
                            </Button>
                            <AsyncActionButton
                              label="Test"
                              pendingLabel="Testing…"
                              pending={cardTestingId === row.id}
                              icon={<ShieldCheck className="h-3.5 w-3.5" />}
                              onClick={() => void testSaved(row)}
                              disabled={togglingId === row.id}
                            />
                            {(meta?.sendable ?? false) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => openSendDialog(row)}
                                aria-label={`Send test email via ${row.name}`}
                              >
                                <Send className="h-3.5 w-3.5" />Send Test
                              </Button>
                            )}
                          </div>
                          <EnabledSwitch
                            checked={row.enabled}
                            onChange={() => void toggleChannel(row)}
                            disabled={togglingId === row.id || cardTestingId === row.id}
                            ariaLabel={`Toggle ${row.name}`}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Available Providers (catalog) ── */}
          <section aria-label="Available email providers" className="space-y-3">
            <h2 className="text-sm font-semibold">
              Available Providers
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {CATALOG.length} supported — pick one to configure
              </span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {CATALOG.map((p) => {
                const configured = kindConfigs.some((c) => c.provider === p.id);
                return (
                  <Card key={p.id} className="relative border bg-card shadow-sm transition-shadow hover:shadow-md">
                    {configured && (
                      <Badge className="absolute right-3 top-3 h-5 border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                        Configured
                      </Badge>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <ProviderChip provider={p} size="lg" />
                        <div className="min-w-0">
                          <CardTitle className="text-sm">{p.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {p.sendable ? "Verify + test send" : "Credential verification"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <CardDescription className="line-clamp-2 text-xs">{p.description}</CardDescription>
                      <CapabilityBadges items={p.capabilities} />
                      <div className="flex items-center justify-between pt-1">
                        <DocsLink url={p.docsUrl} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openNewConfig(p)}
                          aria-label={`Configure ${p.name}`}
                        >
                          <Settings className="h-3.5 w-3.5" />Configure
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </TabsContent>

        {/* ════════════════ API Logs tab ════════════════ */}
        <TabsContent value="logs">
          <Card className="border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">API Activity</CardTitle>
                  <CardDescription className="text-xs">
                    Credential verifications and test sends across your email integrations — newest first.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={logStatus} onValueChange={(v) => setLogStatus(v as "all" | "success" | "failed")}>
                    <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filter logs by status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="success">Success only</SelectItem>
                      <SelectItem value="failed">Failed only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => void fetchData()}
                    disabled={refreshing}
                    aria-label="Refresh logs"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="nice-scroll max-h-[480px] overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Time</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Request</TableHead>
                      <TableHead className="text-xs">Response</TableHead>
                      <TableHead className="text-xs">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs === null ? (
                      [0, 1, 2, 3, 4].map((i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={7} className="py-2">
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : logsError ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-red-600 dark:text-red-400">
                          {logsError}
                        </TableCell>
                      </TableRow>
                    ) : filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center">
                          <ScrollText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                          <p className="text-sm font-medium">No API activity yet</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Run a verification or send a test email — activity will appear here.
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((l) => (
                        <TableRow key={l.id} className="hover:bg-muted/30">
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {timeAgo(l.createdAt)}
                          </TableCell>
                          <TableCell><MethodBadge method={l.method} /></TableCell>
                          <TableCell><StatusBadge status={l.status} /></TableCell>
                          <TableCell className="font-mono text-xs">{l.statusCode || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs" title={l.requestSummary}>
                            {l.requestSummary || "—"}
                          </TableCell>
                          <TableCell
                            className="max-w-[220px] truncate text-xs text-muted-foreground"
                            title={l.errorMessage || l.responseSummary}
                          >
                            {l.errorMessage || l.responseSummary || "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{l.durationMs} ms</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Showing {filteredLogs.length} of {logsTotal} log entries across all integrations (filtered to email providers client-side).
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add Provider picker ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add Email Provider</DialogTitle>
            <DialogDescription className="text-xs">
              Pick a provider from the catalog — you will enter its credentials in the next step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="add-provider" className="text-xs">Provider</Label>
              <Select value={addProviderId} onValueChange={setAddProviderId}>
                <SelectTrigger id="add-provider" className="h-9">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {addProviderId && (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <ProviderChip provider={getProvider(addProviderId) ?? CATALOG[0]} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{getProvider(addProviderId)?.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {getProvider(addProviderId)?.description}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!addProviderId}
              onClick={() => {
                const p = getProvider(addProviderId);
                if (p) openNewConfig(p);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Config dialog (new + edit) ── */}
      <Dialog open={!!dialogProvider} onOpenChange={(o) => { if (!o) closeConfig(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {dialogProvider && <ProviderChip provider={dialogProvider} size="sm" />}
              {editing ? `Configure ${dialogProvider?.name}` : `Add ${dialogProvider?.name}`}
            </DialogTitle>
            <DialogDescription className="text-xs">{dialogProvider?.description}</DialogDescription>
          </DialogHeader>

          <div className="nice-scroll max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {dialogProvider?.setupNotes?.map((note) => <WarningStrip key={note}>{note}</WarningStrip>)}
            {editing && (
              <WarningStrip>
                Stored secrets are masked — leave as-is to keep, or type a new value to replace.
              </WarningStrip>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="channel-name" className="text-xs">Display Name</Label>
              <Input
                id="channel-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={dialogProvider?.name}
              />
            </div>

            {dialogProvider && (
              <DynamicConfigFields
                fields={dialogProvider.fields}
                values={fieldValues}
                onChange={handleFieldChange}
                disabled={saving || verifying}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Environment</Label>
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Test (sandbox)</SelectItem>
                    <SelectItem value="live">Live (production)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="channel-cost" className="text-xs">Cost per request ($)</Label>
                <Input
                  id="channel-cost"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={costPerRequest}
                  onChange={(e) => setCostPerRequest(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">
                  Allow verifications and test sends through this provider
                </p>
              </div>
              <EnabledSwitch checked={enabled} onChange={setEnabled} ariaLabel="Toggle enabled" />
            </div>

            {formError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">{formError}</p>
            )}
            <TestResultBanner result={verifyResult} />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeConfig} disabled={saving || verifying}>
              Cancel
            </Button>
            <AsyncActionButton
              label="Verify Credentials"
              pendingLabel="Verifying…"
              pending={verifying}
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              onClick={() => void verifyCredentials()}
              disabled={saving}
            />
            <Button size="sm" onClick={() => void saveProvider()} disabled={saving || verifying}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send Test dialog ── */}
      <Dialog open={!!sendTarget} onOpenChange={(o) => { if (!o) setSendTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              Send Test via {sendTarget?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Delivers a real email through this provider and records the result in the API log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {sendTarget && !sendTarget.enabled && (
              <WarningStrip>
                This integration is disabled — enable it first; the send API rejects disabled configs.
              </WarningStrip>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="send-to" className="text-xs">To Email Address</Label>
              <Input
                id="send-to"
                type="email"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="ops@example.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send-subject" className="text-xs">Subject</Label>
              <Input
                id="send-subject"
                value={sendSubject}
                onChange={(e) => setSendSubject(e.target.value)}
                placeholder={TEST_SUBJECT}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send-message" className="text-xs">Message</Label>
              <Textarea
                id="send-message"
                rows={3}
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
              />
            </div>
            {sendError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">{sendError}</p>
            )}
            <TestResultBanner result={sendResult} />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSendTarget(null)}>Cancel</Button>
            <AsyncActionButton
              label="Send Test"
              pendingLabel="Sending…"
              pending={sending}
              icon={<Send className="h-3.5 w-3.5" />}
              variant="default"
              onClick={() => void sendTestMessage()}
              disabled={!!sendTarget && !sendTarget.enabled}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EmailGatewayPage;
