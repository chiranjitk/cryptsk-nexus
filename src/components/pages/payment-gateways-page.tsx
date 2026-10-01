"use client";

// ═══════════════════════════════════════════════════════════════
// Payment Gateway Management — production rebuild (Task 2-a)
// Provider catalog driven by @/lib/integrations/client-types.
// API contract: /api/integrations (?type=gateways|stats), POST
// actions save_gateway; /api/integrations/test (configId | inline);
// /api/integrations/transactions (GET ?page&limit&gatewayType).
// NOTE: no delete_gateway action exists — gateways are disabled
// via save_gateway { enabled: false } instead of deleted.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, CircleDollarSign,
  CreditCard, Plus, Receipt, RotateCcw, Settings2, Webhook,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/utils";
import {
  providersByKind, getProvider,
  type AdapterTestResult, type IntegrationConfigRow, type ProviderMeta,
} from "@/lib/integrations/client-types";
import {
  AsyncActionButton, DocsLink, DynamicConfigFields, EnabledPill, EnabledSwitch,
  EnvironmentPill, MiniStat, ProviderChip, TestResultBanner, validateProviderFields,
  WarningStrip,
} from "@/components/integrations/shared";

// ─── Local types ─────────────────────────────────────────────
interface GatewayStats {
  active: number;
  inactive: number;
  total: number;
  webhooks: number;
  totalApiCalls: number;
  totalEstimatedCost: number;
}

interface GatewayTxnRow {
  id: string;
  gatewayType: string;
  transactionType: string;
  amount: number;
  status: string;
  externalRef: string;
  retryCount: number;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function fmtUsd(n: number | undefined | null): string {
  return usd.format(Number(n) || 0);
}
function fmtAbs(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-US", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function fmtRel(ts: string | null | undefined): string {
  if (!ts) return "—";
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtAbs(ts);
}
function parseConfig(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = v == null ? "" : String(v);
    return out;
  } catch {
    return {};
  }
}

/** Minimal metadata fallback for saved rows whose provider id left the catalog. */
function fallbackMeta(id: string): ProviderMeta {
  return {
    id, name: id, kind: "payment", badge: id.slice(0, 2).toUpperCase(),
    color: "bg-muted text-muted-foreground", description: "", docsUrl: "",
    capabilities: [], fields: [], testable: true, sendable: false,
  };
}

// ─── Small local UI atoms ────────────────────────────────────
function ErrorStrip({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

function StatCard({ label, value, tone, icon, loading }: {
  label: string; value: string; tone?: "default" | "good" | "bad" | "warn";
  icon: ReactNode; loading?: boolean;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        {loading ? (
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-14" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <MiniStat label={label} value={value} tone={tone} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "success") {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Success</Badge>;
  }
  if (s === "failed" || s === "failure") {
    return <Badge className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">Failed</Badge>;
  }
  if (s === "pending") {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Pending</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">{status || "—"}</Badge>;
}

// ─── Page ────────────────────────────────────────────────────
export function PaymentGatewaysPage() {
  const PAYMENT_PROVIDERS = useMemo(() => providersByKind("payment"), []);

  // Gateways list
  const [gateways, setGateways] = useState<IntegrationConfigRow[]>([]);
  const [gwLoading, setGwLoading] = useState(true);
  const [gwError, setGwError] = useState<string | null>(null);

  // Global stats
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Tabs + transactions (lazy-loaded on first open)
  const [tab, setTab] = useState("gateways");
  const [txns, setTxns] = useState<GatewayTxnRow[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnError, setTxnError] = useState<string | null>(null);
  const [txnLoaded, setTxnLoaded] = useState(false);
  const [txnStatus, setTxnStatus] = useState("all");

  // Card-level test state: id currently testing + last result per gateway
  const [testingId, setTestingId] = useState<string | null>(null);
  const [cardResults, setCardResults] = useState<Record<string, AdapterTestResult>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Provider-catalog dialog (Add Gateway)
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Config dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMeta, setDialogMeta] = useState<ProviderMeta | null>(null);
  const [editingRow, setEditingRow] = useState<IntegrationConfigRow | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [environment, setEnvironment] = useState("test");
  const [enabled, setEnabled] = useState(true);
  const [ipAllowlist, setIpAllowlist] = useState("");
  const [costPerRequest, setCostPerRequest] = useState("0");
  const [monthlyBudget, setMonthlyBudget] = useState("0");
  const [saving, setSaving] = useState(false);
  const [dialogTesting, setDialogTesting] = useState(false);
  const [dialogResult, setDialogResult] = useState<AdapterTestResult | null>(null);

  // ── Data loaders ───────────────────────────────────────────
  const loadGateways = useCallback(async (silent = false) => {
    if (!silent) { setGwLoading(true); }
    setGwError(null);
    try {
      const data = await apiFetch<{ gateways?: IntegrationConfigRow[] }>("/api/integrations?type=gateways");
      setGateways(Array.isArray(data.gateways) ? data.gateways : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load gateways";
      setGwError(msg);
      toast.error(msg);
    } finally {
      setGwLoading(false);
    }
  }, []);

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await apiFetch<{ stats?: GatewayStats }>("/api/integrations?type=stats");
      setStats(data.stats ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load stats";
      setStatsError(msg);
      toast.error(msg);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadTxns = useCallback(async (silent = false) => {
    if (!silent) setTxnLoading(true);
    setTxnError(null);
    try {
      const data = await apiFetch<{ transactions?: GatewayTxnRow[]; pagination?: { total?: number } }>(
        "/api/integrations/transactions?page=1&limit=100",
      );
      setTxns(Array.isArray(data.transactions) ? data.transactions : []);
      setTxnTotal(data.pagination?.total ?? (data.transactions?.length ?? 0));
      setTxnLoaded(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load transactions";
      setTxnError(msg);
      toast.error(msg);
    } finally {
      setTxnLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGateways();
    void loadStats();
  }, [loadGateways, loadStats]);

  function handleTabChange(v: string) {
    setTab(v);
    if (v === "transactions" && !txnLoaded && !txnLoading) void loadTxns();
  }

  const activeCount = gateways.filter((g) => g.enabled).length;
  const configuredProviders = useMemo(
    () => new Set(gateways.map((g) => g.provider)),
    [gateways],
  );
  const filteredTxns = useMemo(
    () => (txnStatus === "all" ? txns : txns.filter((t) => (t.status || "").toLowerCase() === txnStatus)),
    [txns, txnStatus],
  );

  // ── Config dialog helpers ──────────────────────────────────
  function openNewConfig(meta: ProviderMeta) {
    setEditingRow(null);
    setDialogMeta(meta);
    const seed: Record<string, string> = {};
    for (const f of meta.fields) seed[f.key] = f.defaultValue ?? "";
    setFieldValues(seed);
    setEnvironment("test");
    setEnabled(true);
    setIpAllowlist("");
    setCostPerRequest("0");
    setMonthlyBudget("0");
    setDialogResult(null);
    setDialogOpen(true);
  }

  function openEditConfig(row: IntegrationConfigRow) {
    const meta = getProvider(row.provider) ?? fallbackMeta(row.provider);
    setEditingRow(row);
    setDialogMeta(meta);
    const parsed = parseConfig(row.config);
    const seed: Record<string, string> = { ...parsed };
    for (const f of meta.fields) {
      if (f.topLevel === "apiKey") seed[f.key] = row.apiKey || "";
      else if (f.topLevel === "apiSecret") seed[f.key] = row.apiSecret || "";
      else if (f.topLevel === "merchantId") seed[f.key] = row.merchantId || "";
      else seed[f.key] = parsed[f.key] ?? f.defaultValue ?? "";
    }
    setFieldValues(seed);
    setEnvironment(row.environment === "live" ? "live" : "test");
    setEnabled(row.enabled);
    setIpAllowlist(row.ipAllowlist || "");
    setCostPerRequest(String(row.costPerRequest ?? 0));
    setMonthlyBudget(String(row.monthlyBudget ?? 0));
    setDialogResult(null);
    setDialogOpen(true);
  }

  /** Non-top-level field values → config JSON (preserves unknown keys when editing). */
  function collectConfig(): Record<string, string> {
    const base = editingRow ? parseConfig(editingRow.config) : {};
    const meta = dialogMeta;
    if (meta) for (const f of meta.fields) {
      if (!f.topLevel) base[f.key] = fieldValues[f.key] ?? "";
    }
    return base;
  }

  async function saveGateway() {
    const meta = dialogMeta;
    if (!meta) return;
    const validation = validateProviderFields(meta.fields, fieldValues);
    if (validation) {
      toast.error(validation);
      return;
    }
    const body: Record<string, unknown> = {
      action: "save_gateway",
      gatewayId: editingRow?.id,
      name: editingRow?.name ?? meta.name,
      provider: meta.id,
      environment,
      enabled,
      config: collectConfig(),
      ipAllowlist: ipAllowlist.trim(),
      costPerRequest: Number(costPerRequest) || 0,
      monthlyBudget: Number(monthlyBudget) || 0, // advisory — see worklog note on save_gateway contract
    };
    for (const f of meta.fields) {
      if (f.topLevel === "apiKey") body.apiKey = fieldValues[f.key] ?? "";
      if (f.topLevel === "apiSecret") body.apiSecret = fieldValues[f.key] ?? "";
      if (f.topLevel === "merchantId") body.merchantId = fieldValues[f.key] ?? "";
    }
    setSaving(true);
    try {
      await apiFetch("/api/integrations", { method: "POST", body: JSON.stringify(body) });
      toast.success(`${meta.name} gateway ${editingRow ? "updated" : "connected"}`);
      setDialogOpen(false);
      await Promise.all([loadGateways(true), loadStats(true)]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Inline dialog test. If the form still holds masked (••••) secrets for an
   * existing config we test the SAVED config server-side via configId so the
   * real stored credentials are used; otherwise we test the typed values.
   */
  async function runDialogTest() {
    const meta = dialogMeta;
    if (!meta) return;
    const hasMasked = meta.fields.some((f) => (fieldValues[f.key] ?? "").startsWith("••••"));
    if (!hasMasked) {
      const validation = validateProviderFields(meta.fields, fieldValues);
      if (validation) {
        toast.error(validation);
        return;
      }
    }
    setDialogTesting(true);
    setDialogResult(null);
    try {
      const payload = hasMasked && editingRow
        ? { configId: editingRow.id }
        : { provider: meta.id, config: { ...collectConfig(), ...fieldValues } };
      const data = await apiFetch<{ result?: AdapterTestResult }>("/api/integrations/test", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const result = data.result ?? { ok: false, message: "Empty test response", latencyMs: 0 };
      setDialogResult(result);
      if (result.ok) toast.success(result.message || "Connection successful");
      else toast.error(result.message || "Connection test failed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Test execution failed";
      setDialogResult({ ok: false, message: msg, latencyMs: 0 });
      toast.error(msg);
    } finally {
      setDialogTesting(false);
    }
  }

  async function runCardTest(gw: IntegrationConfigRow) {
    setTestingId(gw.id);
    try {
      const data = await apiFetch<{ result?: AdapterTestResult }>("/api/integrations/test", {
        method: "POST",
        body: JSON.stringify({ configId: gw.id }),
      });
      const result = data.result ?? { ok: false, message: "Empty test response", latencyMs: 0 };
      setCardResults((prev) => ({ ...prev, [gw.id]: result }));
      if (result.ok) toast.success(result.message || `${gw.name}: connection OK`);
      else toast.error(result.message || `${gw.name}: test failed`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Test execution failed";
      setCardResults((prev) => ({ ...prev, [gw.id]: { ok: false, message: msg, latencyMs: 0 } }));
      toast.error(msg);
    } finally {
      setTestingId(null);
    }
  }

  /** Enable/disable without a delete action: save_gateway { enabled }. */
  async function setGatewayEnabled(gw: IntegrationConfigRow, next: boolean) {
    setTogglingId(gw.id);
    try {
      await apiFetch("/api/integrations", {
        method: "POST",
        body: JSON.stringify({
          action: "save_gateway",
          gatewayId: gw.id,
          name: gw.name,
          provider: gw.provider,
          apiKey: gw.apiKey,       // masked round-trip — server preserves stored secrets
          apiSecret: gw.apiSecret,
          merchantId: gw.merchantId,
          environment: gw.environment,
          enabled: next,
          config: parseConfig(gw.config), // pass through — never clobber stored config
          ipAllowlist: gw.ipAllowlist,
          costPerRequest: gw.costPerRequest,
          monthlyBudget: gw.monthlyBudget,
        }),
      });
      toast.success(`${gw.name} ${next ? "enabled" : "disabled"}`);
      await Promise.all([loadGateways(true), loadStats(true)]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setTogglingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <CreditCard className="h-5 w-5 text-primary" aria-hidden />
              Payment Gateway Management
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Connect Razorpay, PhonePe, Paytm, Cashfree, CCAvenue, PayU, Stripe, PayPal and more — credentials are
              verified with real API calls before you go live.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DocsLink url={PAYMENT_PROVIDERS[0]?.docsUrl ?? "https://razorpay.com/docs/api/"} />
            <Button size="sm" className="gap-1.5" onClick={() => setCatalogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add Gateway
            </Button>
          </div>
        </div>

        {/* Stats row */}
        {statsError ? (
          <ErrorStrip message={`Stats unavailable — ${statsError}`} onRetry={() => void loadStats()} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active Gateways" value={`${activeCount} / ${gateways.length}`}
              tone={activeCount > 0 ? "good" : "warn"} loading={gwLoading}
              icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
            />
            <StatCard
              label="Total API Calls" value={String(stats?.totalApiCalls ?? 0)} loading={statsLoading}
              icon={<Activity className="h-5 w-5" aria-hidden />}
            />
            <StatCard
              label="Est. API Cost" value={fmtUsd(stats?.totalEstimatedCost)} loading={statsLoading}
              icon={<CircleDollarSign className="h-5 w-5" aria-hidden />}
            />
            <StatCard
              label="Webhooks Linked" value={String(stats?.webhooks ?? 0)} loading={statsLoading}
              icon={<Webhook className="h-5 w-5" aria-hidden />}
            />
          </div>
        )}

        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList>
            <TabsTrigger value="gateways" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" aria-hidden /> Gateways
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5">
              <Receipt className="h-3.5 w-3.5" aria-hidden /> Transactions
            </TabsTrigger>
          </TabsList>

          {/* ── Gateways tab ── */}
          <TabsContent value="gateways" className="space-y-8">
            {/* Connected gateways */}
            <section className="space-y-4" aria-label="Connected gateways">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Connected Gateways</h2>
                <Badge variant="secondary" className="tabular-nums">{gateways.length}</Badge>
              </div>

              {gwError ? (
                <ErrorStrip message={gwError} onRetry={() => void loadGateways()} />
              ) : gwLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
                </div>
              ) : gateways.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <CreditCard className="h-10 w-10 text-muted-foreground/60" aria-hidden />
                    <div>
                      <p className="font-semibold">No gateways connected</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Connect a provider below to start accepting online payments.
                      </p>
                    </div>
                    <Button size="sm" className="mt-1 gap-1.5" onClick={() => setCatalogOpen(true)}>
                      <Plus className="h-4 w-4" aria-hidden /> Add Gateway
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {gateways.map((gw) => {
                    const meta = getProvider(gw.provider) ?? fallbackMeta(gw.provider);
                    const result = cardResults[gw.id];
                    const budget = gw.monthlyBudget > 0
                      ? Math.min(100, Math.round(((gw.monthlyCost || 0) / gw.monthlyBudget) * 100))
                      : 0;
                    return (
                      <Card key={gw.id} className="flex flex-col gap-4 border shadow-sm transition-shadow hover:shadow-md">
                        <CardContent className="flex flex-1 flex-col gap-4 p-4">
                          {/* Identity */}
                          <div className="flex items-start gap-3">
                            <ProviderChip provider={meta} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold leading-tight">{gw.name}</p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">{gw.provider}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <EnvironmentPill environment={gw.environment} />
                                <EnabledPill enabled={gw.enabled} />
                              </div>
                            </div>
                          </div>

                          {/* Capabilities */}
                          {meta.capabilities.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {meta.capabilities.slice(0, 4).map((c) => (
                                <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                              ))}
                            </div>
                          )}

                          {/* Usage stats + budget */}
                          <div className="mt-auto space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="tabular-nums">{gw.apiCalls || 0} API calls</span>
                              <span className="tabular-nums">{fmtUsd(gw.estimatedCost)} est.</span>
                            </div>
                            {gw.monthlyBudget > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>Budget usage</span>
                                  <span className="tabular-nums">{fmtUsd(gw.monthlyCost)} / {fmtUsd(gw.monthlyBudget)}</span>
                                </div>
                                <Progress
                                  value={budget}
                                  aria-label={`${gw.name} budget usage ${budget}%`}
                                  className="h-1.5"
                                />
                              </div>
                            )}
                          </div>

                          {/* Card-level test result */}
                          {result && <TestResultBanner result={result} className="text-xs" />}

                          {/* Actions */}
                          <div className="flex items-center justify-between gap-2 border-t pt-3">
                            <EnabledSwitch
                              checked={gw.enabled}
                              onChange={(v) => void setGatewayEnabled(gw, v)}
                              disabled={togglingId === gw.id}
                              ariaLabel={`${gw.enabled ? "Disable" : "Enable"} ${gw.name}`}
                            />
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline" size="sm" className="gap-1.5"
                                onClick={() => openEditConfig(gw)}
                              >
                                <Settings2 className="h-3.5 w-3.5" aria-hidden /> Configure
                              </Button>
                              <AsyncActionButton
                                label="Test" pendingLabel="Testing…"
                                pending={testingId === gw.id}
                                onClick={() => void runCardTest(gw)}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Available providers */}
            <section className="space-y-4" aria-label="Available providers">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Available Providers</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {PAYMENT_PROVIDERS.length} supported gateways — pick one to configure credentials.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {PAYMENT_PROVIDERS.map((p) => {
                  const configured = configuredProviders.has(p.id);
                  return (
                    <Card key={p.id} className="flex flex-col gap-3 border shadow-sm transition-shadow hover:shadow-md">
                      <CardContent className="flex flex-1 flex-col gap-3 p-4">
                        <div className="flex items-start gap-3">
                          <ProviderChip provider={p} size="lg" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold">{p.name}</p>
                              {configured && (
                                <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" aria-hidden /> Configured
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {p.capabilities.slice(0, 3).map((c) => (
                            <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                          ))}
                        </div>
                        <div className="mt-auto flex items-center justify-between border-t pt-3">
                          {p.docsUrl ? <DocsLink url={p.docsUrl} /> : <span />}
                          <Button
                            variant="outline" size="sm" className="gap-1.5"
                            onClick={() => {
                              const existing = gateways.find((g) => g.provider === p.id);
                              if (existing) openEditConfig(existing);
                              else openNewConfig(p);
                            }}
                          >
                            <Settings2 className="h-3.5 w-3.5" aria-hidden /> Configure
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          {/* ── Transactions tab ── */}
          <TabsContent value="transactions">
            <Card className="border shadow-sm">
              <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Gateway Transactions</h2>
                    <p className="text-xs text-muted-foreground">
                      {txnLoading ? "Loading…" : `${txnTotal} transaction${txnTotal === 1 ? "" : "s"} recorded`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={txnStatus} onValueChange={setTxnStatus}>
                      <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filter by status">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline" size="sm" onClick={() => void loadTxns()}
                      disabled={txnLoading} aria-label="Refresh transactions" className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Refresh
                    </Button>
                  </div>
                </div>

                {txnError ? (
                  <ErrorStrip message={txnError} onRetry={() => void loadTxns()} />
                ) : (
                  <div className="max-h-[520px] overflow-y-auto rounded-lg border nice-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="text-xs">Gateway</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">External Ref</TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {txnLoading ? (
                          Array.from({ length: 6 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={6} className="py-3"><Skeleton className="h-5 w-full" /></TableCell>
                            </TableRow>
                          ))
                        ) : filteredTxns.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-12">
                              <div className="flex flex-col items-center gap-2 text-center">
                                <Receipt className="h-8 w-8 text-muted-foreground/60" aria-hidden />
                                <p className="text-sm font-medium">
                                  {txns.length === 0 ? "No transactions yet" : "No transactions match this filter"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {txns.length === 0
                                    ? "Gateway activity will appear here once payments start flowing."
                                    : "Try a different status filter."}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredTxns.map((t) => (
                            <TableRow key={t.id} className="hover:bg-muted/30">
                              <TableCell className="text-xs font-medium capitalize">{t.gatewayType || "—"}</TableCell>
                              <TableCell className="text-xs">{t.transactionType || "—"}</TableCell>
                              <TableCell className="text-xs font-semibold tabular-nums">{fmtUsd(t.amount)}</TableCell>
                              <TableCell><StatusBadge status={t.status} /></TableCell>
                              <TableCell className="max-w-[180px] truncate font-mono text-xs" title={t.externalRef || undefined}>
                                {t.externalRef || "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default">{fmtRel(t.createdAt)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>{fmtAbs(t.createdAt)}</TooltipContent>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Provider catalog dialog (Add Gateway) ── */}
        <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a Payment Gateway</DialogTitle>
              <DialogDescription>
                Choose a provider — you will enter its credentials in the next step and can verify them with a real
                test call before saving.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1 nice-scroll">
              {PAYMENT_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setCatalogOpen(false); openNewConfig(p); }}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ProviderChip provider={p} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {p.name}
                      {configuredProviders.has(p.id) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Already configured" aria-label="Already configured" />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{p.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Gateway config dialog ── */}
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto nice-scroll">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {dialogMeta && <ProviderChip provider={dialogMeta} />}
                {editingRow ? "Configure" : "Connect"} {dialogMeta?.name}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                {dialogMeta?.capabilities.map((c) => (
                  <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                ))}
                {dialogMeta?.docsUrl && <DocsLink url={dialogMeta.docsUrl} />}
              </DialogDescription>
            </DialogHeader>

            {editingRow && (
              <WarningStrip>
                Stored secrets are masked — leave as-is to keep, or type a new value to replace.
              </WarningStrip>
            )}

            {dialogMeta && (
              <div className="space-y-5">
                {/* Provider credential fields */}
                {dialogMeta.fields.length > 0 ? (
                  <DynamicConfigFields
                    fields={dialogMeta.fields}
                    values={fieldValues}
                    onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
                    disabled={saving || dialogTesting}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No catalog fields for this provider — its stored configuration is preserved on save.
                  </p>
                )}

                {/* Environment + enabled */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-environment" className="text-xs">Environment</Label>
                    <Select value={environment} onValueChange={setEnvironment} disabled={saving || dialogTesting}>
                      <SelectTrigger id="gw-environment" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="test">Test (sandbox)</SelectItem>
                        <SelectItem value="live">Live (production)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Switch to live only after the provider approves production credentials.</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Enabled</p>
                      <p className="text-xs text-muted-foreground">Route payments through this gateway</p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={setEnabled}
                      disabled={saving || dialogTesting}
                      aria-label="Gateway enabled"
                    />
                  </div>
                </div>

                {/* Advanced */}
                <fieldset className="space-y-4 rounded-lg border p-4" disabled={saving || dialogTesting}>
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Advanced</legend>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label htmlFor="gw-ips" className="text-xs">IP Allowlist</Label>
                      <Input
                        id="gw-ips" value={ipAllowlist}
                        onChange={(e) => setIpAllowlist(e.target.value)}
                        placeholder="203.0.113.5, 10.0.0.0/24"
                        className="font-mono text-xs"
                        autoComplete="off"
                      />
                      <p className="text-[11px] text-muted-foreground">Comma-separated IPv4 / CIDR — leave empty for no restriction.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="gw-cost" className="text-xs">Cost / Request ($)</Label>
                      <Input
                        id="gw-cost" type="number" min="0" step="0.0001"
                        value={costPerRequest}
                        onChange={(e) => setCostPerRequest(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="gw-budget" className="text-xs">Monthly Budget ($)</Label>
                      <Input
                        id="gw-budget" type="number" min="0" step="1"
                        value={monthlyBudget}
                        onChange={(e) => setMonthlyBudget(e.target.value)}
                        className="text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">Advisory cap shown as the card budget bar.</p>
                    </div>
                  </div>
                </fieldset>

                {/* Provider setup notes */}
                {dialogMeta.setupNotes?.map((note) => <WarningStrip key={note}>{note}</WarningStrip>)}
              </div>
            )}

            <DialogFooter className="flex-col items-stretch gap-3 sm:flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AsyncActionButton
                  label="Test Connection" pendingLabel="Testing…" pending={dialogTesting}
                  onClick={() => void runDialogTest()} disabled={saving}
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving || dialogTesting}>
                    Cancel
                  </Button>
                  <Button onClick={() => void saveGateway()} disabled={saving || dialogTesting} className="gap-1.5">
                    {saving ? "Saving…" : editingRow ? "Save Changes" : "Save Gateway"}
                  </Button>
                </div>
              </div>
              <TestResultBanner result={dialogResult} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

export default PaymentGatewaysPage;
