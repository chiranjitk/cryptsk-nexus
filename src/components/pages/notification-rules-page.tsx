"use client";

// ═══════════════════════════════════════════════════════════════
// Notification Rules — event → channel routing
// Pairs with the INTEGRATIONS gateways (Settings → Integrations →
// Communication): EMAIL dispatches via SMTP, SMS/WHATSAPP via the
// SMS gateway, IN_APP/PUSH are recorded for the notification feed.
// Design language mirrors the INTEGRATIONS pages (stat cards with
// icon chips, AsyncActionButton, EnabledSwitch, mono event chips).
// ═══════════════════════════════════════════════════════════════
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Bell,
  Plus,
  Save,
  Trash2,
  Pencil,
  ArrowRight,
  Search,
  Send,
  Copy,
  RefreshCw,
  AlertCircle,
  Inbox,
  ClipboardList,
  CheckCircle2,
  Activity,
  FlaskConical,
  MousePointerClick,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AsyncActionButton, EnabledSwitch, EmptyState, MiniStat, WarningStrip,
  ChannelBadge, timeAgo, formatTimestamp,
} from "@/components/alerts/shared";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────
interface NotificationRule {
  id: string;
  name: string;
  triggerEvent: string;
  channel: string; // "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH"
  templateId: string;
  message: string;
  isActive: boolean;
  createdAt: string;
}

interface RecentDelivery {
  id: string;
  title: string;
  type: string;
  status: string; // "SENT" | "DELIVERED" | "READ" | "FAILED" | "PENDING"
  createdAt: string;
  message: string;
}

interface RuleStats {
  total: number;
  active: number;
  last24h: number;
  delivered24h: number;
  byChannel: Record<string, number>;
  recentDeliveries: RecentDelivery[];
}

interface TestRuleResult {
  success: boolean;
  error?: string;
  details?: {
    channel?: string;
    recipient?: string | null;
    provider?: string;
    note?: string;
    success?: boolean;
  };
}

// ─── Constants ───────────────────────────────────────────────────
const CHANNELS = ["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"] as const;

// Grouped trigger-event catalog — grouped Select in the form dialog.
const EVENT_CATALOG: { group: string; events: string[] }[] = [
  { group: "Billing", events: ["invoice.generated", "invoice.paid", "invoice.overdue", "payment.received"] },
  { group: "Subscriber", events: ["subscriber.created", "subscriber.suspended", "subscriber.expired", "plan.changed"] },
  { group: "Support", events: ["complaint.opened", "complaint.resolved"] },
  { group: "Network & Alerts", events: ["alert.triggered", "radius.auth-failure", "device.offline"] },
  { group: "Other", events: ["custom"] },
];
const ALL_EVENTS = EVENT_CATALOG.flatMap((g) => g.events);

// Template variables supported by the delivery pipeline + sample
// values used for the live preview line in the form dialog.
const TEMPLATE_VARS: { token: string; sample: string; hint: string }[] = [
  { token: "{{name}}", sample: "Ravi Kumar", hint: "Subscriber full name" },
  { token: "{{invoice}}", sample: "INV-2025-0042", hint: "Invoice number" },
  { token: "{{amount}}", sample: "₹1,499", hint: "Amount due / paid" },
  { token: "{{dueDate}}", sample: "12 Nov 2025", hint: "Payment due date" },
  { token: "{{ticket}}", sample: "#CMP-1042", hint: "Complaint ticket id" },
  { token: "{{device}}", sample: "RT-AP-014", hint: "Network device id" },
  { token: "{{severity}}", sample: "Critical", hint: "Alert severity" },
  { token: "{{time}}", sample: "14:32, 12 Nov", hint: "Event timestamp" },
];

const VAR_TOKEN_RE = /(\{\{\s*[a-zA-Z_]+\s*\}\})/g;

// Per-channel test-recipient requirements: EMAIL/SMS/WHATSAPP need
// a real destination (SMTP + SMS gateway dispatch for real).
const CHANNEL_RECIPIENT: Record<string, { label: string; placeholder: string; hint: string }> = {
  EMAIL: { label: "Test recipient email *", placeholder: "ops@company.com", hint: "Dispatched through the SMTP gateway configured in INTEGRATIONS → Email." },
  SMS: { label: "Test phone number (E.164) *", placeholder: "+919876543210", hint: "Dispatched through the SMS gateway configured in INTEGRATIONS → SMS." },
  WHATSAPP: { label: "Test phone number (E.164) *", placeholder: "+919876543210", hint: "Dispatched through the WhatsApp gateway configured in INTEGRATIONS → WhatsApp & Push." },
};

const DELIVERY_STATUS: Record<string, string> = {
  SENT: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300",
  DELIVERED: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  READ: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  FAILED: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300",
  PENDING: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
};

const EMPTY_FORM = {
  name: "",
  triggerEvent: "invoice.generated",
  channel: "IN_APP",
  templateId: "",
  message: "",
  isActive: true,
};
type RuleForm = typeof EMPTY_FORM;

// ─── Helpers ─────────────────────────────────────────────────────
/** Extract the backend `error` field from an apiFetch error message
 *  ("API 502: {json}" → "No SMTP provider configured …"). */
function apiErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/^API \d+:\s*([\s\S]+)$/);
  const body = m ? m[1] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch { /* not JSON */ }
  return body || "Request failed";
}

/** Split a message body into plain text + {{var}} tokens so template
 *  variables can be highlighted (amber mono) in previews. */
function tokenizeMessage(message: string): { text: string; isVar: boolean }[] {
  return message.split(VAR_TOKEN_RE).filter((p) => p !== "").map((part) => ({
    text: part,
    isVar: /^\{\{\s*[a-zA-Z_]+\s*\}\}$/.test(part),
  }));
}

/** Replace {{var}} tokens with sample values for the live preview. */
function interpolate(message: string): { text: string; isUnknownVar: boolean }[] {
  const samples = new Map(TEMPLATE_VARS.map((v) => [v.token, v.sample]));
  return message.split(VAR_TOKEN_RE).filter((p) => p !== "").map((part) => {
    if (/^\{\{\s*[a-zA-Z_]+\s*\}\}$/.test(part)) {
      return { text: samples.get(part) ?? part, isUnknownVar: !samples.has(part) };
    }
    return { text: part, isUnknownVar: false };
  });
}

// ─── Small presentational components ─────────────────────────────
function StatCard({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string; tone?: "default" | "good" | "bad" | "warn";
}) {
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

/** Message preview with {{vars}} highlighted amber mono. */
function MessagePreview({ message, className }: { message: string; className?: string }) {
  if (!message) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`truncate ${className ?? ""}`} title={message}>
      {tokenizeMessage(message).map((t, i) =>
        t.isVar ? (
          <span
            key={i}
            className="mx-px rounded bg-amber-100 px-1 font-mono text-[10px] text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
          >
            {t.text}
          </span>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </span>
  );
}

/** Mono chip for trigger events (invoice.paid …). */
function EventChip({ event }: { event: string }) {
  if (!event) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="font-mono text-[10px] font-normal text-muted-foreground">
      {event}
    </Badge>
  );
}

/** Delivery status pill — SENT sky / DELIVERED emerald / READ slate /
 *  FAILED red / PENDING amber. */
function DeliveryStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${DELIVERY_STATUS[status] ?? "text-muted-foreground"}`}>
      {status}
    </Badge>
  );
}

// ─── Rule form dialog (create / edit / duplicate) ────────────────
function RuleFormDialog({
  open, onOpenChange, editing, sourceRule, saving, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: NotificationRule | null;
  sourceRule: NotificationRule | null; // duplicate source (prefill, saved as new)
  saving: boolean;
  onSave: (form: RuleForm) => void;
}) {
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [nameTouched, setNameTouched] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const isEdit = !!editing;
  const isDuplicate = !isEdit && !!sourceRule;

  // Sync form state whenever the dialog (re)opens for a different purpose.
  const openKey = `${open}-${editing?.id ?? "new"}-${sourceRule?.id ?? "none"}`;
  const [lastOpenKey, setLastOpenKey] = useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (open) {
      const base = editing ?? sourceRule;
      setForm(base
        ? {
          name: editing ? base.name : `${base.name} (copy)`,
          triggerEvent: base.triggerEvent || "custom",
          channel: base.channel || "IN_APP",
          templateId: base.templateId || "",
          message: base.message || "",
          isActive: editing ? base.isActive : false, // duplicates start disabled for review
        }
        : { ...EMPTY_FORM });
      setNameTouched(false);
    }
  }

  const nameError = nameTouched && !form.name.trim() ? "Rule name is required" : null;
  const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  /** Insert a template token at the caret position of the textarea. */
  const insertToken = useCallback((token: string) => {
    const ta = messageRef.current;
    const current = form.message;
    const start = ta?.selectionStart ?? current.length;
    const end = ta?.selectionEnd ?? start;
    const next = current.slice(0, start) + token + current.slice(end);
    set("message", next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  }, [form.message]);

  const preview = useMemo(() => interpolate(form.message), [form.message]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Notification Rule" : isDuplicate ? "Duplicate Notification Rule" : "Create Notification Rule"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update how this event is routed to a customer channel."
              : isDuplicate
                ? "Review the copy, then enable it when ready."
                : "Route a platform event to a delivery channel — pairs with the gateways configured in INTEGRATIONS."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {isDuplicate && (
            <WarningStrip>
              Duplicates start <span className="font-semibold">inactive</span> so events are not double-routed.
              Toggle it on from the table once reviewed.
            </WarningStrip>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rule-name" className="text-xs">Rule Name <span className="text-red-500">*</span></Label>
            <Input
              id="rule-name"
              value={form.name}
              onChange={(e) => { setNameTouched(true); set("name", e.target.value); }}
              placeholder="e.g. Invoice paid → WhatsApp"
              aria-invalid={!!nameError}
              className={nameError ? "border-red-400" : ""}
            />
            {nameError && <p className="text-[11px] text-red-600">{nameError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Trigger Event</Label>
            <Select value={form.triggerEvent} onValueChange={(v) => set("triggerEvent", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select event" /></SelectTrigger>
              <SelectContent>
                {EVENT_CATALOG.map((g) => (
                  <SelectGroup key={g.group}>
                    <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.group}</SelectLabel>
                    {g.events.map((ev) => (
                      <SelectItem key={ev} value={ev}>
                        <span className="font-mono text-xs">{ev}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Channel</Label>
            <Select value={form.channel} onValueChange={(v) => set("channel", v)}>
              <SelectTrigger className="w-full">
                <span className="flex items-center gap-2">
                  <ChannelBadge channel={form.channel} size="xs" />
                  <span className="text-xs text-muted-foreground">
                    {form.channel === "EMAIL" && "via SMTP gateway"}
                    {form.channel === "SMS" && "via SMS gateway"}
                    {form.channel === "WHATSAPP" && "via WhatsApp gateway"}
                    {form.channel === "PUSH" && "via FCM adapter"}
                    {form.channel === "IN_APP" && "in-app notification feed"}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="flex items-center gap-2"><ChannelBadge channel={c} size="xs" />{c}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(form.channel === "EMAIL" || form.channel === "SMS" || form.channel === "WHATSAPP") && (
              <p className="text-[11px] text-muted-foreground">
                Deliveries use the provider configured in <span className="font-medium text-foreground">Settings → INTEGRATIONS → Communication</span>. Use “Test” on the rule to verify end-to-end.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-template" className="text-xs">Template ID <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="rule-template"
              value={form.templateId}
              onChange={(e) => set("templateId", e.target.value)}
              placeholder="Provider template reference, e.g. wtpl_invoice_paid"
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-message" className="text-xs">Message Body</Label>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <MousePointerClick className="h-3 w-3" />click to insert at cursor
              </span>
            </div>
            <Textarea
              id="rule-message"
              ref={messageRef}
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder="Hi {{name}}, your invoice {{invoice}} for {{amount}} is ready…"
              rows={3}
              className="text-xs"
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {TEMPLATE_VARS.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  title={v.hint}
                  aria-label={`Insert ${v.token} into message body`}
                  onClick={() => insertToken(v.token)}
                  className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                >
                  {v.token}
                </button>
              ))}
            </div>
            {/* Live preview with sample values */}
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <FlaskConical className="h-3 w-3" />Preview with sample values
              </p>
              <p className="text-xs leading-relaxed">
                {form.message
                  ? preview.map((p, i) =>
                    p.isUnknownVar ? (
                      <span key={i} className="rounded bg-amber-100 px-1 font-mono text-[10px] text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{p.text}</span>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )
                  : <span className="text-muted-foreground">Start typing or insert a template variable above…</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Route matching events through this rule</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} aria-label="Toggle rule active" />
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <AsyncActionButton
              label={isEdit ? "Update Rule" : "Create Rule"}
              pendingLabel="Saving…"
              pending={saving}
              icon={<Save className="h-3.5 w-3.5" />}
              variant="default"
              disabled={!form.name.trim()}
              onClick={() => onSave(form)}
            />
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Test dialog ────────────────────────────────────────────
function TestRuleDialog({
  rule, open, onOpenChange, onSend, sending, outcome,
}: {
  rule: NotificationRule | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSend: (rule: NotificationRule, recipient: string) => void;
  sending: boolean;
  outcome: TestRuleResult | null; // last dispatch result for this rule (parent-tracked)
}) {
  const needsRecipient = !!rule && !!CHANNEL_RECIPIENT[rule.channel];
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset local state when a different rule opens.
  const ruleId = rule?.id ?? null;
  const [lastRuleId, setLastRuleId] = useState<string | null>(ruleId);
  if (ruleId !== lastRuleId) {
    setLastRuleId(ruleId);
    setRecipient("");
    setError(null);
  }

  const rcMeta = rule ? CHANNEL_RECIPIENT[rule.channel] : undefined;
  const canSend = !!rule && (!needsRecipient || recipient.trim().length > 0);

  const submit = () => {
    if (!rule) return;
    if (needsRecipient && !recipient.trim()) {
      setError(rcMeta?.label.replace(" *", "") + " is required for a " + rule.channel + " test");
      return;
    }
    setError(null);
    onSend(rule, recipient.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setError(null); } onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />Send Test
          </DialogTitle>
          <DialogDescription>
            Fires a real dispatch through the rule’s channel so you can verify the full pipeline.
          </DialogDescription>
        </DialogHeader>

        {rule && (
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{rule.name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{rule.triggerEvent || "any event"}</p>
              </div>
              <ChannelBadge channel={rule.channel} />
            </div>

            {rcMeta && (
              <div className="space-y-1.5">
                <Label htmlFor="test-recipient" className="text-xs">{rcMeta.label}</Label>
                <Input
                  id="test-recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder={rcMeta.placeholder}
                  autoComplete={rule.channel === "EMAIL" ? "email" : "tel"}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">{rcMeta.hint}</p>
              </div>
            )}
            {!rcMeta && (
              <p className="text-xs text-muted-foreground">
                {rule.channel === "IN_APP"
                  ? "The test will be recorded in the in-app notification feed and appear under Recent Deliveries."
                  : "The test will be routed via the push adapter and recorded under Recent Deliveries."}
              </p>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50/70 p-2.5 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            {outcome?.success && outcome.details && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Test dispatched</p>
                <p className="mt-1 text-[11px] opacity-90">
                  {outcome.details.channel}
                  {outcome.details.recipient ? ` → ${outcome.details.recipient}` : ""}
                  {outcome.details.provider ? ` · provider: ${outcome.details.provider}` : ""}
                </p>
                {outcome.details.note && <p className="mt-0.5 text-[11px] opacity-80">{outcome.details.note}</p>}
              </div>
            )}

            {outcome && outcome.success === false && outcome.error && (
              <div className="rounded-lg border border-red-200 bg-red-50/70 p-2.5 text-xs text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
                <p className="font-medium">Dispatch failed</p>
                <p className="mt-0.5 text-[11px] opacity-90">{outcome.error}</p>
                {(outcome.error.includes("SMTP") || outcome.error.includes("provider")) && (
                  <p className="mt-1 text-[11px] opacity-80">Check the gateway configuration under Settings → INTEGRATIONS → Communication.</p>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <AsyncActionButton
                label="Send Test"
                pendingLabel="Dispatching…"
                pending={sending}
                icon={<Send className="h-3.5 w-3.5" />}
                variant="default"
                disabled={!canSend}
                onClick={submit}
              />
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ───────────────────────────────────────────────────
export function NotificationRulesPage() {
  const qc = useQueryClient();

  // ── filters ──
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [eventFilter, setEventFilter] = useState("ALL");

  // ── dialogs ──
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [duplicating, setDuplicating] = useState<NotificationRule | null>(null);
  const [testTarget, setTestTarget] = useState<NotificationRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRule | null>(null);
  // Outcome of the last test dispatch, keyed by rule id → fed to TestRuleDialog.
  const [testOutcomes, setTestOutcomes] = useState<Record<string, TestRuleResult>>({});

  // ── query (always include=stats: page needs the stat strip + deliveries) ──
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<{ rules: NotificationRule[]; stats?: RuleStats }>({
    queryKey: ["notification-rules", "with-stats"],
    queryFn: () => apiFetch("/api/notification-rules?include=stats"),
    refetchInterval: 30000,
  });
  const rules: NotificationRule[] = useMemo(() => data?.rules ?? [], [data]);
  const stats = data?.stats;
  const recentDeliveries: RecentDelivery[] = stats?.recentDeliveries ?? [];

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (channelFilter !== "ALL" && r.channel !== channelFilter) return false;
      if (eventFilter !== "ALL" && r.triggerEvent !== eventFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.triggerEvent.toLowerCase().includes(q) ||
        (r.message ?? "").toLowerCase().includes(q) ||
        (r.templateId ?? "").toLowerCase().includes(q)
      );
    });
  }, [rules, search, channelFilter, eventFilter]);

  // ── mutations ──
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notification-rules"] });

  const saveMutation = useMutation({
    mutationFn: (form: RuleForm) =>
      editing
        ? apiFetch("/api/notification-rules", {
          method: "PUT",
          body: JSON.stringify({
            id: editing.id, name: form.name, triggerEvent: form.triggerEvent, channel: form.channel,
            templateId: form.templateId, message: form.message, isActive: form.isActive,
          }),
        })
        : apiFetch("/api/notification-rules", {
          method: "POST",
          body: JSON.stringify({
            name: form.name, triggerEvent: form.triggerEvent, channel: form.channel,
            templateId: form.templateId, message: form.message, isActive: form.isActive,
          }),
        }),
    onSuccess: () => {
      invalidate();
      toast.success(editing ? "Rule updated" : duplicating ? "Rule duplicated (inactive)" : "Rule created");
      setFormOpen(false); setEditing(null); setDuplicating(null);
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: NotificationRule) =>
      apiFetch("/api/notification-rules", {
        method: "PUT",
        body: JSON.stringify({
          id: rule.id, name: rule.name, triggerEvent: rule.triggerEvent, channel: rule.channel,
          templateId: rule.templateId, message: rule.message, isActive: !rule.isActive,
        }),
      }),
    onSuccess: (_res, rule) => { invalidate(); toast.success(rule.isActive ? `“${rule.name}” disabled` : `“${rule.name}” enabled`); },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notification-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast.success("Rule deleted"); setDeleteTarget(null); },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const testMutation = useMutation({
    mutationFn: ({ id, testRecipient }: { id: string; testRecipient?: string }) =>
      apiFetch<TestRuleResult>("/api/notification-rules", {
        method: "POST",
        body: JSON.stringify({ action: "test-rule", id, ...(testRecipient ? { testRecipient } : {}) }),
      }),
    onSuccess: (res, vars) => {
      invalidate();
      setTestOutcomes((prev) => ({ ...prev, [vars.id]: res }));
      const d = res.details ?? {};
      toast.success("Test dispatched", {
        description: [d.channel, d.recipient, d.provider ? `provider: ${d.provider}` : null, d.note].filter(Boolean).join(" · ") || "Delivery recorded",
      });
    },
    onError: (e: unknown, vars) => {
      const msg = apiErrorMessage(e);
      setTestOutcomes((prev) => ({ ...prev, [vars.id]: { success: false, error: msg } }));
      toast.error("Test dispatch failed", { description: msg });
    },
  });

  // ── derived stats ──
  const failedRecent = recentDeliveries.filter((d) => d.status === "FAILED").length;
  const byChannelEntries = Object.entries(stats?.byChannel ?? {}).filter(([, n]) => n > 0);

  const openCreate = () => { setEditing(null); setDuplicating(null); setFormOpen(true); };
  const openEdit = (rule: NotificationRule) => { setDuplicating(null); setEditing(rule); setFormOpen(true); };
  const openDuplicate = (rule: NotificationRule) => { setEditing(null); setDuplicating(rule); setFormOpen(true); };
  const openTest = (rule: NotificationRule) => setTestTarget(rule);
  const handleSave = (form: RuleForm) => saveMutation.mutate(form);
  const handleSendTest = (rule: NotificationRule, recipient: string) =>
    testMutation.mutate({ id: rule.id, ...(recipient ? { testRecipient: recipient } : {}) });

  const hasActiveFilters = search.trim() !== "" || channelFilter !== "ALL" || eventFilter !== "ALL";

  return (
    <div className="space-y-4">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bell className="h-4 w-4 text-primary" />
            </span>
            Notification Rules
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Route platform events like <span className="font-mono text-xs">invoice.paid</span> to customer channels —
            dispatches ride the gateways configured in <span className="font-medium text-foreground">INTEGRATIONS → Communication</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules…"
              aria-label="Search notification rules"
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Filter by channel">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All channels</SelectItem>
              {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Filter by trigger event">
              <SelectValue placeholder="Event" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="ALL">All events</SelectItem>
              {EVENT_CATALOG.map((g) => (
                <SelectGroup key={g.group}>
                  <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.group}</SelectLabel>
                  {g.events.map((ev) => (
                    <SelectItem key={ev} value={ev}><span className="font-mono text-xs">{ev}</span></SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />New Rule
          </Button>
        </div>
      </div>

      {/* ─── Stat strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={<ClipboardList className="h-4 w-4" />} label="Total Rules" value={String(stats?.total ?? rules.length)} />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Active"
          value={String(stats?.active ?? rules.filter((r) => r.isActive).length)}
          tone="good"
        />
        <StatCard icon={<Send className="h-4 w-4" />} label="Deliveries 24h" value={String(stats?.last24h ?? 0)} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Delivered 24h" value={String(stats?.delivered24h ?? 0)} tone="good" />
        <StatCard icon={<AlertCircle className="h-4 w-4" />} label="Failed 24h" value={recentDeliveries.length > 0 ? String(failedRecent) : "—"} tone={failedRecent > 0 ? "bad" : "default"} />
      </div>

      {/* ─── Main grid: rules table + recent deliveries ─────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Rules table */}
        <Card className="border shadow-sm lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between border-b px-4 pb-3 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Rules
              <Badge variant="secondary" className="text-[10px]">{filteredRules.length}{hasActiveFilters ? ` of ${rules.length}` : ""}</Badge>
            </CardTitle>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              aria-label="Refresh rules"
              title="Refresh"
              onClick={() => refetch()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : isError ? (
              <div className="p-8 text-center">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
                <p className="text-sm font-medium">Failed to load rules</p>
                <p className="mt-1 text-xs text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry
                </Button>
              </div>
            ) : rules.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No notification rules yet"
                hint="Create a rule to route events like invoice.paid or alert.triggered to Email, SMS, WhatsApp, Push or the in-app feed."
                action={<Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3.5 w-3.5" />New Rule</Button>}
              />
            ) : filteredRules.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No rules match your filters"
                hint={hasActiveFilters ? "Adjust the search, channel or event filter to see more rules." : undefined}
                action={hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={() => { setSearch(""); setChannelFilter("ALL"); setEventFilter("ALL"); }}>
                    Clear filters
                  </Button>
                ) : undefined}
              />
            ) : (
              <div className="max-h-[62vh] overflow-auto nice-scroll">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs">Rule</TableHead>
                      <TableHead className="text-xs">Trigger Event</TableHead>
                      <TableHead className="w-8 text-center text-xs"><ArrowRight className="inline h-3 w-3" aria-hidden /></TableHead>
                      <TableHead className="text-xs">Channel</TableHead>
                      <TableHead className="text-xs">Message</TableHead>
                      <TableHead className="text-center text-xs">Status</TableHead>
                      <TableHead className="text-right text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRules.map((rule) => (
                      <TableRow key={rule.id} className="hover:bg-muted/30">
                        <TableCell className="max-w-[170px]">
                          <p className="truncate text-xs font-semibold" title={rule.name}>{rule.name}</p>
                          {rule.templateId && (
                            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={rule.templateId}>
                              tpl: {rule.templateId}
                            </p>
                          )}
                        </TableCell>
                        <TableCell><EventChip event={rule.triggerEvent} /></TableCell>
                        <TableCell className="text-center text-muted-foreground"><ArrowRight className="inline h-3 w-3" aria-hidden /></TableCell>
                        <TableCell><ChannelBadge channel={rule.channel} /></TableCell>
                        <TableCell className="max-w-[200px] text-xs">
                          <MessagePreview message={rule.message} className="block text-muted-foreground" />
                        </TableCell>
                        <TableCell className="text-center">
                          <EnabledSwitch
                            checked={rule.isActive}
                            onChange={() => toggleMutation.mutate(rule)}
                            disabled={toggleMutation.isPending}
                            ariaLabel={`Toggle ${rule.name}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <AsyncActionButton
                              label="Test"
                              pendingLabel="Sending"
                              pending={testMutation.isPending && testTarget?.id === rule.id}
                              icon={<Send className="h-3 w-3" />}
                              onClick={() => openTest(rule)}
                              className="h-7 px-2 text-[11px]"
                            />
                            <Button
                              variant="outline" size="icon" className="h-7 w-7"
                              title="Edit rule" aria-label={`Edit ${rule.name}`}
                              onClick={() => openEdit(rule)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline" size="icon" className="h-7 w-7"
                              title="Duplicate rule" aria-label={`Duplicate ${rule.name}`}
                              onClick={() => openDuplicate(rule)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline" size="icon"
                              className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                              title="Delete rule" aria-label={`Delete ${rule.name}`}
                              onClick={() => setDeleteTarget(rule)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Deliveries panel */}
        <Card className="border shadow-sm">
          <CardHeader className="flex-row items-center justify-between border-b px-4 pb-3 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              Recent Deliveries
              <Badge variant="secondary" className="text-[10px]">24h</Badge>
            </CardTitle>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              aria-label="Refresh deliveries" title="Refresh"
              onClick={() => refetch()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            {/* 24h channel distribution */}
            {byChannelEntries.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">By channel</span>
                {byChannelEntries.map(([ch, n]) => (
                  <Badge key={ch} variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal">
                    <ChannelBadge channel={ch} size="xs" />×{n}
                  </Badge>
                ))}
              </div>
            )}
            <Separator className="mb-3" />

            {recentDeliveries.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No deliveries in the last 24h"
                hint="Test sends and event-driven notifications routed through your rules will appear here."
                action={<Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>}
              />
            ) : (
              <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1 nice-scroll">
                {recentDeliveries.map((d) => (
                  <div key={d.id} className="rounded-lg border p-2.5 transition-colors hover:bg-muted/30">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <ChannelBadge channel={d.type} size="xs" />
                        <p className="truncate text-xs font-medium" title={d.title}>{d.title}</p>
                      </div>
                      <DeliveryStatusBadge status={d.status} />
                    </div>
                    {d.message && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground" title={d.message}>
                        {d.message}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground" title={formatTimestamp(d.createdAt)}>
                      {timeAgo(d.createdAt)} · {formatTimestamp(d.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Create / Edit / Duplicate dialog ───────────────── */}
      <RuleFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) { setEditing(null); setDuplicating(null); } }}
        editing={editing}
        sourceRule={duplicating}
        saving={saveMutation.isPending}
        onSave={handleSave}
      />

      {/* ─── Send Test dialog ───────────────────────────────── */}
      <TestRuleDialog
        rule={testTarget}
        open={!!testTarget}
        onOpenChange={(o) => { if (!o) setTestTarget(null); }}
        onSend={handleSendTest}
        sending={testMutation.isPending}
        outcome={testTarget ? testOutcomes[testTarget.id] ?? null : null}
      />

      {/* ─── Delete confirmation ────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete notification rule?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{deleteTarget?.name}</span> will stop routing
              {" "}<span className="font-mono text-xs">{deleteTarget?.triggerEvent || "events"}</span> to{" "}
              <span className="font-semibold">{deleteTarget?.channel}</span>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Rule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default NotificationRulesPage;
