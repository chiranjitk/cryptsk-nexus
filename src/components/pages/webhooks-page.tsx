"use client";

// ═══════════════════════════════════════════════════════════════
// Webhooks & Events — production rebuild (Task 2-a)
// Endpoints CRUD + signed test deliveries + delivery history.
// API contract: /api/integrations GET ?type=webhooks|deliveries;
// POST actions create_webhook / toggle_webhook / delete_webhook /
// update_webhook / test_webhook / retry_delivery.
// EVENT_CATALOG mirrors the events actually emitted by the
// platform (see src/lib/services/webhook-service.ts call sites).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, Braces, Check, CheckCircle2, Clock3, Copy, History,
  KeyRound, Pencil, Plus, RefreshCcw, RotateCcw, Send, Trash2, Webhook, XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/utils";
import type { WebhookDeliveryRow, WebhookRow } from "@/lib/integrations/client-types";
import { AsyncActionButton, EnabledPill, EnabledSwitch, MiniStat } from "@/components/integrations/shared";

// ─── Event catalog (real platform emissions) ─────────────────
interface EventMeta {
  event: string;
  description: string;
  since: string;
}

const EVENT_CATALOG: EventMeta[] = [
  { event: "subscriber.created", description: "A new subscriber account was provisioned.", since: "v1.0" },
  { event: "subscriber.status_changed", description: "Subscriber moved between active, suspended or terminated states.", since: "v1.1" },
  { event: "plan.changed", description: "A subscriber's plan was upgraded, downgraded or migrated.", since: "v1.0" },
  { event: "payment.initiated", description: "A payment order was created at a gateway (checkout started).", since: "v1.1" },
  { event: "payment.received", description: "A gateway confirmed a payment — wallet credit and receipting follow.", since: "v1.0" },
  { event: "invoice.paid", description: "An invoice was settled in full by a received payment.", since: "v1.0" },
  { event: "complaint.opened", description: "A subscriber raised a new support complaint.", since: "v1.0" },
  { event: "notification.sent", description: "An outbound notification (SMS / email / push) was dispatched.", since: "v1.2" },
  { event: "webhook.test", description: "Signed test delivery triggered by the Test Fire action.", since: "v1.0" },
];

// ─── Local types ─────────────────────────────────────────────
interface WebhookTestResult {
  ok: boolean;
  statusCode: number;
  durationMs: number;
  response: string;
  signatureSent?: string;
}

// ─── Helpers ─────────────────────────────────────────────────
function parseEvents(raw: string | null): string[] {
  try {
    const arr = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
function maskSecret(secret: string): string {
  if (!secret) return "—";
  if (secret.startsWith("whsec_")) return `whsec_••••${secret.slice(-4)}`;
  return `••••${secret.slice(-4)}`;
}
function generateWebhookSecret(): string {
  const bytes = new Uint8Array(12); // → 24 hex chars
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `whsec_${hex}`;
}
function isValidWebhookUrl(u: string): boolean {
  // https:// required everywhere except local dev endpoints
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/.test(u)) return true;
  return /^https:\/\/\S+\.\S+(\/\S*)?$/.test(u);
}
function fmtAbs(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-US", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
function fmtRel(ts: string | null | undefined): string {
  if (!ts) return "never";
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

// ─── Small local UI atoms ────────────────────────────────────
function ErrorStrip({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
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

/** Inline banner for test_webhook results (statusCode + duration + signature). */
function TestFireBanner({ result }: { result: WebhookTestResult }) {
  return (
    <div
      role="status"
      className={`rounded-lg border p-3 text-sm ${
        result.ok
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-red-200 bg-red-50/70 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200"
      }`}
    >
      <div className="flex items-start gap-3">
        {result.ok
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">
            {result.ok ? "Test delivery accepted" : "Test delivery failed"} — HTTP {result.statusCode || "no response"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-80">
            <span className="tabular-nums">{result.durationMs} ms</span>
            {result.signatureSent && (
              <span className="inline-flex items-center gap-1 font-mono">
                <KeyRound className="h-3 w-3" aria-hidden /> {result.signatureSent}
              </span>
            )}
          </p>
          {result.response && (
            <pre className="mt-2 max-h-24 overflow-auto rounded bg-black/5 p-2 text-[11px] leading-relaxed dark:bg-white/5">
              {result.response}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryStatusBadge({ success }: { success: boolean }) {
  return success ? (
    <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
      <CheckCircle2 className="h-3 w-3" aria-hidden /> Delivered
    </Badge>
  ) : (
    <Badge className="gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
      <XCircle className="h-3 w-3" aria-hidden /> Failed
    </Badge>
  );
}

// ─── Page ────────────────────────────────────────────────────
export function WebhooksPage() {
  // Endpoints
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [whLoading, setWhLoading] = useState(true);
  const [whError, setWhError] = useState<string | null>(null);

  // Tabs + delivery history (lazy on first open)
  const [tab, setTab] = useState("endpoints");
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [dLoading, setDLoading] = useState(false);
  const [dError, setDError] = useState<string | null>(null);
  const [dLoaded, setDLoaded] = useState(false);
  const [dEventFilter, setDEventFilter] = useState("all");
  const [dStatusFilter, setDStatusFilter] = useState("all");

  // Row action pending states
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, WebhookTestResult>>({});
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [newErrors, setNewErrors] = useState<{ url?: string; events?: string }>({});
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WebhookRow | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editSecret, setEditSecret] = useState("");
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [editErrors, setEditErrors] = useState<{ url?: string; events?: string }>({});
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<WebhookRow | null>(null);

  // ── Data loaders ───────────────────────────────────────────
  const loadWebhooks = useCallback(async (silent = false) => {
    if (!silent) setWhLoading(true);
    setWhError(null);
    try {
      const data = await apiFetch<{ webhooks?: WebhookRow[] }>("/api/integrations?type=webhooks");
      setWebhooks(Array.isArray(data.webhooks) ? data.webhooks : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load webhooks";
      setWhError(msg);
      toast.error(msg);
    } finally {
      setWhLoading(false);
    }
  }, []);

  const loadDeliveries = useCallback(async (silent = false) => {
    if (!silent) setDLoading(true);
    setDError(null);
    try {
      const data = await apiFetch<{ deliveries?: WebhookDeliveryRow[] }>(
        "/api/integrations/deliveries?limit=100",
      );
      setDeliveries(Array.isArray(data.deliveries) ? data.deliveries : []);
      setDLoaded(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load delivery history";
      setDError(msg);
      toast.error(msg);
    } finally {
      setDLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWebhooks();
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [loadWebhooks]);

  function handleTabChange(v: string) {
    setTab(v);
    if (v === "history" && !dLoaded && !dLoading) void loadDeliveries();
  }

  // ── Derived stats ──────────────────────────────────────────
  const activeEndpoints = webhooks.filter((w) => w.enabled).length;
  const totals = useMemo(() => {
    let ok = 0;
    let all = 0;
    let last: string | null = null;
    for (const w of webhooks) {
      ok += w.successCount || 0;
      all += (w.successCount || 0) + (w.failureCount || 0);
      if (w.lastDeliveryAt && (!last || new Date(w.lastDeliveryAt) > new Date(last))) last = w.lastDeliveryAt;
    }
    return { ok, all, last, rate: all > 0 ? Math.round((ok / all) * 100) : 100 };
  }, [webhooks]);

  const filteredDeliveries = useMemo(
    () => deliveries.filter((d) =>
      (dEventFilter === "all" || d.event === dEventFilter) &&
      (dStatusFilter === "all" || (dStatusFilter === "success" ? d.success : !d.success)),
    ),
    [deliveries, dEventFilter, dStatusFilter],
  );

  // ── Clipboard (copy + transient check feedback) ────────────
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      toast.success("Copied to clipboard", { id: "copy" });
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedKey(null), 1500);
    }).catch(() => toast.error("Could not copy to clipboard"));
  }

  // ── Actions ────────────────────────────────────────────────
  async function createWebhook() {
    const errors: { url?: string; events?: string } = {};
    if (!isValidWebhookUrl(newUrl.trim())) {
      errors.url = "Enter a valid https:// endpoint URL (http:// allowed for localhost only)";
    }
    if (newEvents.length === 0) {
      errors.events = "Select at least one event";
    }
    setNewErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCreating(true);
    try {
      await apiFetch("/api/integrations", {
        method: "POST",
        body: JSON.stringify({
          action: "create_webhook",
          url: newUrl.trim(),
          events: newEvents,
          secret: newSecret.trim() || undefined, // server auto-generates whsec_… when absent
        }),
      });
      toast.success("Webhook endpoint created");
      setCreateOpen(false);
      setNewUrl(""); setNewSecret(""); setNewEvents([]); setNewErrors({});
      await Promise.all([loadWebhooks(true), dLoaded ? loadDeliveries(true) : Promise.resolve()]);
      setTab("endpoints");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function toggleWebhook(wh: WebhookRow) {
    setTogglingId(wh.id);
    try {
      const data = await apiFetch<{ message?: string }>("/api/integrations", {
        method: "POST",
        body: JSON.stringify({ action: "toggle_webhook", webhookId: wh.id }),
      });
      toast.success(data.message ?? `Webhook ${wh.enabled ? "deactivated" : "activated"}`);
      await loadWebhooks(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setTogglingId(null);
    }
  }

  async function testFire(wh: WebhookRow) {
    setTestingId(wh.id);
    try {
      const data = await apiFetch<{ result?: WebhookTestResult }>("/api/integrations", {
        method: "POST",
        body: JSON.stringify({ action: "test_webhook", webhookId: wh.id }),
      });
      const result: WebhookTestResult = data.result ?? {
        ok: false, statusCode: 0, durationMs: 0, response: "Empty test response",
      };
      setTestResults((prev) => ({ ...prev, [wh.id]: result }));
      if (result.ok) toast.success(`Test delivered — HTTP ${result.statusCode}`);
      else toast.error(result.response ? `Test failed — ${result.response.slice(0, 120)}` : "Test delivery failed");
      await Promise.all([loadWebhooks(true), dLoaded ? loadDeliveries(true) : Promise.resolve()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test fire failed");
    } finally {
      setTestingId(null);
    }
  }

  async function regenerateSecret(wh: WebhookRow) {
    const next = generateWebhookSecret();
    setRegenId(wh.id);
    try {
      await apiFetch("/api/integrations", {
        method: "POST",
        body: JSON.stringify({ action: "update_webhook", webhookId: wh.id, secret: next }),
      });
      toast.success("Signing secret regenerated — use the copy button to retrieve it");
      await loadWebhooks(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Secret regeneration failed");
    } finally {
      setRegenId(null);
    }
  }

  function openEdit(wh: WebhookRow) {
    setEditTarget(wh);
    setEditUrl(wh.url);
    setEditSecret(""); // empty = keep existing secret
    setEditEvents(parseEvents(wh.events));
    setEditErrors({});
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editTarget) return;
    const errors: { url?: string; events?: string } = {};
    if (!isValidWebhookUrl(editUrl.trim())) {
      errors.url = "Enter a valid https:// endpoint URL (http:// allowed for localhost only)";
    }
    if (editEvents.length === 0) {
      errors.events = "Select at least one event";
    }
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setEditSaving(true);
    try {
      await apiFetch("/api/integrations", {
        method: "POST",
        body: JSON.stringify({
          action: "update_webhook",
          webhookId: editTarget.id,
          url: editUrl.trim(),
          events: editEvents,
          secret: editSecret.trim() || undefined, // omitted → existing secret preserved server-side
        }),
      });
      toast.success("Webhook endpoint updated");
      setEditOpen(false);
      setEditTarget(null);
      await loadWebhooks(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch("/api/integrations", {
        method: "POST",
        body: JSON.stringify({ action: "delete_webhook", webhookId: deleteTarget.id }),
      });
      toast.success("Webhook endpoint deleted");
      setDeleteTarget(null);
      await Promise.all([loadWebhooks(true), dLoaded ? loadDeliveries(true) : Promise.resolve()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function retryDelivery(d: WebhookDeliveryRow) {
    setRetryingId(d.id);
    try {
      const data = await apiFetch<{ delivery?: WebhookDeliveryRow }>("/api/integrations", {
        method: "POST",
        body: JSON.stringify({ action: "retry_delivery", deliveryId: d.id }),
      });
      if (data.delivery) {
        setDeliveries((prev) => [data.delivery as WebhookDeliveryRow, ...prev]);
        if (data.delivery.success) {
          toast.success(`Retry delivered — HTTP ${data.delivery.statusCode}`);
        } else {
          toast.error(`Retry failed — ${data.delivery.errorMessage || `HTTP ${data.delivery.statusCode}`}`);
        }
      } else {
        toast.success("Retry dispatched");
      }
      await loadWebhooks(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryingId(null);
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
              <Webhook className="h-5 w-5 text-primary" aria-hidden />
              Webhooks &amp; Events
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Receive real-time, HMAC-signed event notifications at your own endpoints — every delivery is logged and retryable.
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Create Webhook
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Active Endpoints" value={`${activeEndpoints} / ${webhooks.length}`}
            tone={activeEndpoints > 0 ? "good" : "warn"} loading={whLoading}
            icon={<Webhook className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Success Rate" value={`${totals.rate}%`}
            tone={totals.rate >= 95 ? "good" : totals.rate >= 70 ? "warn" : "bad"} loading={whLoading}
            icon={<Activity className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Total Deliveries" value={String(totals.all)} loading={whLoading}
            icon={<Send className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Last Delivery" value={fmtRel(totals.last)} loading={whLoading}
            icon={<Clock3 className="h-5 w-5" aria-hidden />}
          />
        </div>

        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList>
            <TabsTrigger value="endpoints" className="gap-1.5">
              <Webhook className="h-3.5 w-3.5" aria-hidden /> Endpoints
            </TabsTrigger>
            <TabsTrigger value="catalog" className="gap-1.5">
              <Braces className="h-3.5 w-3.5" aria-hidden /> Event Catalog
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-3.5 w-3.5" aria-hidden /> Delivery History
            </TabsTrigger>
          </TabsList>

          {/* ── Endpoints tab ── */}
          <TabsContent value="endpoints" className="space-y-4">
            {whError ? (
              <ErrorStrip message={whError} onRetry={() => void loadWebhooks()} />
            ) : whLoading ? (
              <div className="space-y-4">
                {[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
              </div>
            ) : webhooks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Webhook className="h-10 w-10 text-muted-foreground/60" aria-hidden />
                  <div>
                    <p className="font-semibold">No webhook endpoints</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create an endpoint to receive platform events like payment.received or invoice.paid.
                    </p>
                  </div>
                  <Button size="sm" className="mt-1 gap-1.5" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> Create Webhook
                  </Button>
                </CardContent>
              </Card>
            ) : (
              webhooks.map((wh) => {
                const events = parseEvents(wh.events);
                const shown = events.slice(0, 3);
                const rest = events.slice(3);
                const result = testResults[wh.id];
                return (
                  <Card key={wh.id} className="border shadow-sm">
                    <CardContent className="space-y-3 p-4">
                      {/* URL + primary actions */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 basis-64">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <code className="truncate rounded bg-muted px-2 py-1 font-mono text-xs" title={wh.url}>
                              {wh.url}
                            </code>
                            <Button
                              variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0"
                              onClick={() => copy(`url:${wh.id}`, wh.url)}
                              aria-label="Copy endpoint URL"
                            >
                              {copiedKey === `url:${wh.id}`
                                ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                                : <Copy className="h-3.5 w-3.5" aria-hidden />}
                            </Button>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <EnabledPill enabled={wh.enabled} />
                            <span className="tabular-nums">
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">{wh.successCount || 0} delivered</span>
                              {" · "}
                              <span className="font-medium text-red-600 dark:text-red-400">{wh.failureCount || 0} failed</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3 w-3" aria-hidden /> last {fmtRel(wh.lastDeliveryAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <EnabledSwitch
                            checked={wh.enabled}
                            onChange={() => void toggleWebhook(wh)}
                            disabled={togglingId === wh.id}
                            ariaLabel={`${wh.enabled ? "Disable" : "Enable"} webhook ${wh.url}`}
                          />
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0"
                            onClick={() => openEdit(wh)} aria-label="Edit webhook"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <AsyncActionButton
                            label="Test Fire" pendingLabel="Firing…" pending={testingId === wh.id}
                            icon={<Send className="h-3.5 w-3.5" aria-hidden />}
                            onClick={() => void testFire(wh)}
                          />
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                            onClick={() => setDeleteTarget(wh)} aria-label="Delete webhook"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </div>

                      {/* Event subscriptions */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {shown.map((ev) => (
                          <Badge key={ev} variant="secondary" className="font-mono text-[10px]">{ev}</Badge>
                        ))}
                        {rest.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="cursor-default text-[10px]">+{rest.length} more</Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-56">
                              <span className="font-mono">{rest.join(", ")}</span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {events.length === 0 && (
                          <span className="text-xs text-muted-foreground">No events subscribed</span>
                        )}
                      </div>

                      {/* Signing secret */}
                      <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <KeyRound className="h-3 w-3" aria-hidden /> Signing secret
                        </span>
                        <code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                          {maskSecret(wh.secret)}
                        </code>
                        <Button
                          variant="ghost" size="sm" className="h-6 w-6 p-0"
                          onClick={() => copy(`secret:${wh.id}`, wh.secret)}
                          aria-label="Copy signing secret"
                        >
                          {copiedKey === `secret:${wh.id}`
                            ? <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                            : <Copy className="h-3 w-3" aria-hidden />}
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-6 w-6 p-0"
                          onClick={() => void regenerateSecret(wh)}
                          disabled={regenId === wh.id}
                          aria-label="Regenerate signing secret"
                        >
                          <RefreshCcw className={`h-3 w-3 ${regenId === wh.id ? "animate-spin" : ""}`} aria-hidden />
                        </Button>
                      </div>

                      {/* Inline test result */}
                      {result && <TestFireBanner result={result} />}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* ── Event Catalog tab ── */}
          <TabsContent value="catalog">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {EVENT_CATALOG.map((ev) => (
                <Card key={ev.event} className="border shadow-sm">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <code className="truncate font-mono text-xs font-semibold">{ev.event}</code>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">since {ev.since}</Badge>
                        <Button
                          variant="ghost" size="sm" className="h-6 w-6 p-0"
                          onClick={() => copy(`event:${ev.event}`, ev.event)}
                          aria-label={`Copy event name ${ev.event}`}
                        >
                          {copiedKey === `event:${ev.event}`
                            ? <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                            : <Copy className="h-3 w-3" aria-hidden />}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{ev.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Delivery History tab ── */}
          <TabsContent value="history">
            <Card className="border shadow-sm">
              <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Delivery History</h2>
                    <p className="text-xs text-muted-foreground">
                      {dLoading ? "Loading…" : `Latest ${deliveries.length} delivery attempt${deliveries.length === 1 ? "" : "s"} across all endpoints`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={dEventFilter} onValueChange={setDEventFilter}>
                      <SelectTrigger className="h-8 w-44 text-xs" aria-label="Filter by event">
                        <SelectValue placeholder="All events" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All events</SelectItem>
                        {EVENT_CATALOG.map((ev) => (
                          <SelectItem key={ev.event} value={ev.event}>{ev.event}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={dStatusFilter} onValueChange={setDStatusFilter}>
                      <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filter by status">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="success">Delivered</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline" size="sm" onClick={() => void loadDeliveries()}
                      disabled={dLoading} aria-label="Refresh delivery history" className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Refresh
                    </Button>
                  </div>
                </div>

                {dError ? (
                  <ErrorStrip message={dError} onRetry={() => void loadDeliveries()} />
                ) : (
                  <div className="max-h-[520px] overflow-y-auto rounded-lg border nice-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="text-xs">Event</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Code</TableHead>
                          <TableHead className="text-xs">Duration</TableHead>
                          <TableHead className="text-xs">Error</TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="w-20 text-xs"><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dLoading ? (
                          Array.from({ length: 6 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={7} className="py-3"><Skeleton className="h-5 w-full" /></TableCell>
                            </TableRow>
                          ))
                        ) : filteredDeliveries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="py-12">
                              <div className="flex flex-col items-center gap-2 text-center">
                                <History className="h-8 w-8 text-muted-foreground/60" aria-hidden />
                                <p className="text-sm font-medium">
                                  {deliveries.length === 0 ? "No deliveries yet" : "No deliveries match these filters"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {deliveries.length === 0
                                    ? "Fire a test from an endpoint card to see signed deliveries here."
                                    : "Try a different event or status filter."}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredDeliveries.map((d) => (
                            <TableRow key={d.id} className="hover:bg-muted/30">
                              <TableCell>
                                <Badge variant="secondary" className="max-w-44 truncate font-mono text-[10px]" title={d.event}>
                                  {d.event}
                                </Badge>
                              </TableCell>
                              <TableCell><DeliveryStatusBadge success={d.success} /></TableCell>
                              <TableCell className="font-mono text-xs tabular-nums">{d.statusCode || "—"}</TableCell>
                              <TableCell className="text-xs tabular-nums">{d.duration} ms</TableCell>
                              <TableCell className="max-w-52">
                                {d.errorMessage ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="block cursor-default truncate text-xs text-red-600 dark:text-red-400">
                                        {d.errorMessage}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-72 break-words">{d.errorMessage}</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default">{fmtRel(d.createdAt)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>{fmtAbs(d.createdAt)}</TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell>
                                <AsyncActionButton
                                  label="Retry" pendingLabel="…" pending={retryingId === d.id}
                                  icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                                  onClick={() => void retryDelivery(d)}
                                />
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

        {/* ── Create webhook dialog ── */}
        <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto nice-scroll">
            <DialogHeader>
              <DialogTitle>Create Webhook Endpoint</DialogTitle>
              <DialogDescription>
                Deliveries are signed with HMAC-SHA256 — verify the signature header before trusting a payload.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wh-url" className="text-xs">Endpoint URL</Label>
                <Input
                  id="wh-url" value={newUrl}
                  onChange={(e) => { setNewUrl(e.target.value); setNewErrors((p) => ({ ...p, url: undefined })); }}
                  placeholder="https://your-server.com/webhooks/cryptsk"
                  className="font-mono text-xs"
                  autoComplete="off"
                  aria-invalid={Boolean(newErrors.url)}
                />
                {newErrors.url && <p className="text-xs text-red-600 dark:text-red-400">{newErrors.url}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Subscribe to events ({newEvents.length} selected)</Label>
                <div className="grid max-h-44 grid-cols-1 gap-0.5 overflow-y-auto rounded-lg border p-2 nice-scroll">
                  {EVENT_CATALOG.map((ev) => {
                    const checked = newEvents.includes(ev.event);
                    return (
                      <label
                        key={ev.event}
                        className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => {
                            setNewEvents((prev) => prev.includes(ev.event)
                              ? prev.filter((e) => e !== ev.event)
                              : [...prev, ev.event]);
                            setNewErrors((p) => ({ ...p, events: undefined }));
                          }}
                          aria-label={`Subscribe to ${ev.event}`}
                        />
                        <span className="font-mono">{ev.event}</span>
                      </label>
                    );
                  })}
                </div>
                {newErrors.events && <p className="text-xs text-red-600 dark:text-red-400">{newErrors.events}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-secret" className="text-xs">Signing secret (optional)</Label>
                <Input
                  id="wh-secret" value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  placeholder="auto-generates whsec_…"
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave empty to auto-generate. You can copy or regenerate the secret from the endpoint card at any time.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
              <Button onClick={() => void createWebhook()} disabled={creating} className="gap-1.5">
                {creating ? "Creating…" : "Create Endpoint"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit webhook dialog ── */}
        <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditTarget(null); } }}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto nice-scroll">
            <DialogHeader>
              <DialogTitle>Edit Webhook Endpoint</DialogTitle>
              <DialogDescription className="truncate font-mono text-xs">{editTarget?.url}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wh-edit-url" className="text-xs">Endpoint URL</Label>
                <Input
                  id="wh-edit-url" value={editUrl}
                  onChange={(e) => { setEditUrl(e.target.value); setEditErrors((p) => ({ ...p, url: undefined })); }}
                  className="font-mono text-xs"
                  autoComplete="off"
                  aria-invalid={Boolean(editErrors.url)}
                />
                {editErrors.url && <p className="text-xs text-red-600 dark:text-red-400">{editErrors.url}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Subscribed events ({editEvents.length} selected)</Label>
                <div className="grid max-h-44 grid-cols-1 gap-0.5 overflow-y-auto rounded-lg border p-2 nice-scroll">
                  {EVENT_CATALOG.map((ev) => {
                    const checked = editEvents.includes(ev.event);
                    return (
                      <label
                        key={ev.event}
                        className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => {
                            setEditEvents((prev) => prev.includes(ev.event)
                              ? prev.filter((e) => e !== ev.event)
                              : [...prev, ev.event]);
                            setEditErrors((p) => ({ ...p, events: undefined }));
                          }}
                          aria-label={`Subscribe to ${ev.event}`}
                        />
                        <span className="font-mono">{ev.event}</span>
                      </label>
                    );
                  })}
                </div>
                {editErrors.events && <p className="text-xs text-red-600 dark:text-red-400">{editErrors.events}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-edit-secret" className="text-xs">Signing secret</Label>
                <Input
                  id="wh-edit-secret" value={editSecret}
                  onChange={(e) => setEditSecret(e.target.value)}
                  placeholder={`current: ${maskSecret(editTarget?.secret ?? "")}`}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  Leave empty to keep the existing secret — typing a new value replaces it immediately.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditOpen(false); setEditTarget(null); }} disabled={editSaving}>
                Cancel
              </Button>
              <Button onClick={() => void saveEdit()} disabled={editSaving} className="gap-1.5">
                {editSaving ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirmation ── */}
        <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete webhook endpoint?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes <span className="break-all font-mono text-xs">{deleteTarget?.url}</span> and stops
                all event deliveries to it. Its delivery history is kept in the log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={deleting}
                onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              >
                {deleting ? "Deleting…" : "Delete Endpoint"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

export default WebhooksPage;
