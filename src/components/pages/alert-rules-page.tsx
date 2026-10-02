"use client";

// ═══════════════════════════════════════════════════════════════
// Alert Rules — production rebuild (Task 2-b)
// CRUD + test-fire for AlertRule against GET/POST /api/alerts.
//
// API contract (verified against src/app/api/alerts/route.ts):
// • GET /api/alerts → { alerts, rules, users, suppressions,
//   maintenanceWindows, stats }. Rules arrive with `threshold` as a
//   STRING ("" when 0), `severity` Capitalized ("Critical"),
//   `notifyVia` as string[], `escalationLevels` as a parsed array of
//   { afterMinutes, action } (or arbitrary legacy JSON), plus
//   `isSuppressed` and `activeSuppression` for live suppression
//   state. Filters (search/status/severity) are applied client-side
//   so the stat strip always sees the full rule set.
// • POST create-rule / update-rule / toggle-rule / delete-rule all
//   key off `id` — the route destructures { id }, so ruleId-only
//   payloads 400 (mismatch vs. the old page; fixed here). We send
//   both `id` and `ruleId` where the backend accepts either.
// • suppress-rule accepts ruleId|alertRuleId; trigger-alert runs the
//   REAL pipeline (suppression → maintenance window → dedup) and
//   answers { success, suppressed?, deduplicated?, message?, data? }.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, ClipboardList, Copy, Flame, Info, PauseCircle,
  Pencil, Plus, RotateCcw, Search, ShieldAlert, Trash2, TrendingUp, X, Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  AsyncActionButton, ChannelBadge, ChannelBadgeList, CountdownChip, EnabledSwitch,
  EmptyState, SeverityBadge, SeverityLegend, WarningStrip,
} from "@/components/alerts/shared";

// ─── Types ───────────────────────────────────────────────────

interface LadderRow {
  afterMinutes: number;
  action: string;
}

interface ActiveSuppressionInfo {
  id?: string;
  alertRuleId?: string | null;
  reason?: string | null;
  suppressedBy?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: string | number; // STRING from the API ("" when 0)
  severity: string;           // Capitalized: "Critical"
  notifyVia: string[];        // parsed from notifyChannels JSON
  enabled: boolean;
  cooldownMinutes: number;
  escalationEnabled: boolean;
  escalationLevels: unknown[]; // { afterMinutes, action } after JSON.parse
  autoEscalate: boolean;
  escalationIntervalMinutes: number;
  maxSeverity: string;
  deduplicationWindowMinutes: number;
  isSuppressed: boolean;
  activeSuppression: ActiveSuppressionInfo | null;
}

interface AlertsPayload {
  rules?: AlertRule[];
  suppressions?: unknown[];
  maintenanceWindows?: unknown[];
  stats?: { active: number; today: number; acknowledged: number; resolved: number };
}

interface TriggerAlertResult {
  success?: boolean;
  suppressed?: boolean;
  deduplicated?: boolean;
  message?: string;
  data?: unknown;
}

interface RuleFormState {
  name: string;
  condition: string;
  threshold: string;
  severity: string;
  channels: string[];
  cooldownMinutes: string;
  deduplicationWindowMinutes: string;
  escalationEnabled: boolean;
  autoEscalate: boolean;
  escalationIntervalMinutes: string;
  maxSeverity: string;
  ladder: { afterMinutes: string; action: string }[];
  enabled: boolean;
}

type TestOutcome = "fired" | "suppressed" | "deduplicated" | "error";

interface TestFireResultState {
  ruleName: string;
  outcome: TestOutcome;
  message: string;
}

// ─── Constants ───────────────────────────────────────────────

const QUERY_KEY = ["alert-rules-page"] as const;

const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const MAX_SEVERITY_OPTIONS = ["MEDIUM", "HIGH", "CRITICAL"] as const;
const CHANNEL_OPTIONS = ["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"] as const;
const LADDER_ACTIONS = [
  { value: "notify", label: "Notify responders" },
  { value: "escalate", label: "Escalate severity" },
  { value: "ticket", label: "Open ticket" },
  { value: "webhook", label: "Call webhook" },
] as const;

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
  { value: "suppressed", label: "Suppressed" },
] as const;

const EMPTY_FORM: RuleFormState = {
  name: "",
  condition: "",
  threshold: "",
  severity: "MEDIUM",
  channels: ["IN_APP", "EMAIL"],
  cooldownMinutes: "5",
  deduplicationWindowMinutes: "10",
  escalationEnabled: false,
  autoEscalate: false,
  escalationIntervalMinutes: "30",
  maxSeverity: "CRITICAL",
  ladder: [],
  enabled: true,
};

const VIOLET_BADGE =
  "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300";

// ─── Helpers ─────────────────────────────────────────────────

/** "Critical" | "critical" | "CRITICAL" → "CRITICAL" (defaults MEDIUM). */
function normSev(raw: string | null | undefined): string {
  const v = (raw ?? "").toUpperCase();
  return (SEVERITY_OPTIONS as readonly string[]).includes(v) ? v : "MEDIUM";
}

/** API sends threshold as a string; parse defensively for POST bodies. */
function parseThreshold(raw: string | number | null | undefined): number {
  const n = parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toInt(raw: string, fallback: number): number {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Normalize stored escalationLevels JSON into editable rows. */
function normalizeLadder(raw: unknown): { afterMinutes: string; action: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((item) => {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      return { afterMinutes: String(o.afterMinutes ?? ""), action: String(o.action ?? "notify") };
    }
    return { afterMinutes: String(item ?? ""), action: "notify" };
  });
}

/**
 * Fires-On label: substitute the threshold value into the condition
 * expression, e.g. condition "device.cpuUsage > threshold" with
 * threshold "85" → "device.cpuUsage > 85". Units are NOT invented —
 * the threshold is unit-agnostic on the backend.
 */
function firesOnLabel(rule: AlertRule): string {
  const cond = (rule.condition || "").trim();
  const t = String(rule.threshold ?? "").trim();
  if (cond && /threshold/i.test(cond)) return t ? cond.replace(/threshold/gi, t) : cond;
  if (cond && t) return `${cond} · ${t}`;
  if (cond) return cond;
  if (t) return `threshold ${t}`;
  return "manual trigger";
}

// ─── Local UI atoms ──────────────────────────────────────────

function StatCard({ label, value, tone = "default", icon, loading }: {
  label: string; value: string; tone?: "default" | "good" | "bad" | "warn" | "violet";
  icon: ReactNode; loading?: boolean;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-red-600 dark:text-red-400",
    warn: "text-amber-600 dark:text-amber-400",
    violet: "text-violet-600 dark:text-violet-400",
  };
  return (
    <Card className="border shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        {loading ? (
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-12" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className={`text-sm font-semibold ${tones[tone]}`}>{value}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorStrip({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

/** Result strip for the Test Fire pipeline (suppression / dedup / created). */
function TestFireBanner({ result, onOpenLiveAlerts, onDismiss }: {
  result: TestFireResultState;
  onOpenLiveAlerts: () => void;
  onDismiss: () => void;
}) {
  const styles: Record<TestOutcome, string> = {
    fired: "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200",
    deduplicated: "border-sky-200 bg-sky-50/70 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-200",
    suppressed: VIOLET_BADGE,
    error: "border-red-200 bg-red-50/70 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200",
  };
  const icons: Record<TestOutcome, ReactNode> = {
    fired: <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />,
    deduplicated: <Info className="h-4 w-4 shrink-0" aria-hidden />,
    suppressed: <PauseCircle className="h-4 w-4 shrink-0" aria-hidden />,
    error: <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />,
  };
  return (
    <div role="status" className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${styles[result.outcome]}`}>
      {icons[result.outcome]}
      <span className="min-w-0 flex-1 break-words">
        <span className="font-medium">{result.ruleName}</span> — {result.message}
      </span>
      {result.outcome === "fired" && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs font-semibold" onClick={onOpenLiveAlerts}>
          Open Live Alerts
        </Button>
      )}
      <Button
        variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDismiss}
        aria-label="Dismiss test-fire result" title="Dismiss"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

/** Violet escalation chip: auto cadence → severity ceiling, or manual ladder. */
function EscalationChip({ rule }: { rule: AlertRule }) {
  if (!rule.escalationEnabled) return <span className="text-xs text-muted-foreground">—</span>;
  const levels = Array.isArray(rule.escalationLevels) ? rule.escalationLevels.length : 0;
  const label = rule.autoEscalate
    ? `auto every ${rule.escalationIntervalMinutes}m → cap ${normSev(rule.maxSeverity)}`
    : `manual ladder · ${levels} level${levels === 1 ? "" : "s"}`;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] font-medium ${VIOLET_BADGE}`} title={label}>
      <Zap className="h-2.5 w-2.5" aria-hidden />
      {label}
    </Badge>
  );
}

// ─── Escalation ladder editor (inside the rule dialog) ───────

function LadderEditor({ ladder, onChange }: {
  ladder: { afterMinutes: string; action: string }[];
  onChange: (rows: { afterMinutes: string; action: string }[]) => void;
}) {
  function updateRow(idx: number, patch: Partial<{ afterMinutes: string; action: string }>) {
    onChange(ladder.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">Escalation ladder</Label>
          <p className="text-[10px] text-muted-foreground">
            Stored with the rule as {`{ afterMinutes, action }`} steps — the auto-escalation engine
            advances severity on the interval above up to the ceiling.
          </p>
        </div>
        <Button
          type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => onChange([...ladder, { afterMinutes: "15", action: "notify" }])}
          disabled={ladder.length >= 12}
        >
          <Plus className="h-3 w-3" aria-hidden /> Add step
        </Button>
      </div>
      {ladder.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No steps yet — add one to describe the runbook.</p>
      )}
      {ladder.map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            type="number" min={0} className="h-8 w-24 text-xs" value={row.afterMinutes}
            onChange={(e) => updateRow(idx, { afterMinutes: e.target.value })}
            placeholder="15" aria-label={`Step ${idx + 1}: minutes after alert`}
          />
          <span className="text-xs text-muted-foreground">min →</span>
          <Select value={row.action} onValueChange={(v) => updateRow(idx, { action: v })}>
            <SelectTrigger className="h-8 flex-1 text-xs" aria-label={`Step ${idx + 1}: action`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LADDER_ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0 text-red-600"
            onClick={() => onChange(ladder.filter((_, i) => i !== idx))}
            aria-label={`Remove escalation step ${idx + 1}`} title="Remove step"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Rule create/edit dialog ─────────────────────────────────

function RuleFormDialog({ open, onOpenChange, editing, submitting, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AlertRule | null;
  submitting: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Re-seed the form when the dialog opens (create: blank, edit: rule values).
  if (open && (hydratedFor === null || hydratedFor !== (editing?.id ?? "new"))) {
    setForm(editing ? {
      name: editing.name,
      condition: editing.condition ?? "",
      threshold: String(editing.threshold ?? ""),
      severity: normSev(editing.severity),
      channels: Array.isArray(editing.notifyVia) ? [...editing.notifyVia] : [],
      cooldownMinutes: String(editing.cooldownMinutes ?? 5),
      deduplicationWindowMinutes: String(editing.deduplicationWindowMinutes ?? 10),
      escalationEnabled: !!editing.escalationEnabled,
      autoEscalate: !!editing.autoEscalate,
      escalationIntervalMinutes: String(editing.escalationIntervalMinutes ?? 30),
      maxSeverity: normSev(editing.maxSeverity || "CRITICAL"),
      ladder: normalizeLadder(editing.escalationLevels),
      enabled: !!editing.enabled,
    } : EMPTY_FORM);
    setHydratedFor(editing?.id ?? "new");
  }
  if (!open && hydratedFor !== null) setHydratedFor(null);

  function patch(p: Partial<RuleFormState>) { setForm((f) => ({ ...f, ...p })); }
  function toggleChannel(ch: string) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch],
    }));
  }

  function submit() {
    if (!form.name.trim()) { toast.error("Rule name is required"); return; }
    const badStep = form.ladder.findIndex((row) => row.afterMinutes.trim() === "" || parseInt(row.afterMinutes, 10) < 0 || Number.isNaN(parseInt(row.afterMinutes, 10)));
    if (form.escalationEnabled && badStep >= 0) {
      toast.error(`Escalation step ${badStep + 1} needs a minute value ≥ 0`);
      return;
    }
    onSubmit({
      action: editing ? "update-rule" : "create-rule",
      id: editing?.id,
      ruleId: editing?.id, // tolerated by routes that accept either key
      name: form.name.trim(),
      condition: form.condition.trim(),
      threshold: parseThreshold(form.threshold),
      severity: normSev(form.severity),
      notifyChannels: form.channels, // string[] — backend stores JSON
      cooldownMinutes: toInt(form.cooldownMinutes, 5),
      enabled: form.enabled,
      escalationEnabled: form.escalationEnabled,
      escalationLevels: form.escalationEnabled
        ? form.ladder.map((row) => ({ afterMinutes: parseInt(row.afterMinutes, 10) || 0, action: row.action }))
        : [],
      autoEscalate: form.escalationEnabled ? form.autoEscalate : false,
      escalationIntervalMinutes: toInt(form.escalationIntervalMinutes, 30),
      maxSeverity: normSev(form.maxSeverity),
      deduplicationWindowMinutes: toInt(form.deduplicationWindowMinutes, 10),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Alert Rule" : "Create Alert Rule"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply to future evaluations — existing alerts are untouched."
              : "Define what fires, how loudly, and who gets notified."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Rule Name <span className="text-red-500">*</span></Label>
            <Input
              id="rule-name" value={form.name} placeholder="e.g. High CPU on OLT"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-condition">Condition</Label>
            <Input
              id="rule-condition" value={form.condition} placeholder="device.cpuUsage > threshold"
              onChange={(e) => patch({ condition: e.target.value })}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              e.g. <code className="rounded bg-muted px-1 font-mono">device.cpuUsage &gt; threshold%</code> — the
              word <span className="font-mono">threshold</span> is substituted with the value below when displayed.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-threshold">Threshold</Label>
              <Input
                id="rule-threshold" type="number" step="any" value={form.threshold}
                onChange={(e) => patch({ threshold: e.target.value })} placeholder="85"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={(v) => patch({ severity: v })}>
                <SelectTrigger aria-label="Rule severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      <span className="flex items-center gap-2"><SeverityBadge severity={s} size="xs" />{s}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Channels — checkbox row with live badge previews */}
          <div className="space-y-1.5">
            <Label>Notify channels</Label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((ch) => {
                const checked = form.channels.includes(ch);
                return (
                  <label
                    key={ch}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                      checked ? "border-primary bg-primary/5 font-medium" : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleChannel(ch)}
                      aria-label={`Notify via ${ch.toLowerCase().replace("_", "-")}`}
                    />
                    <ChannelBadge channel={ch} size="xs" />
                  </label>
                );
              })}
            </div>
            {form.channels.length === 0 && (
              <WarningStrip>
                No channels selected — alerts will be recorded in-app only, no external notifications are sent.
              </WarningStrip>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-cooldown">Cooldown (min)</Label>
              <Input
                id="rule-cooldown" type="number" min={0} value={form.cooldownMinutes}
                onChange={(e) => patch({ cooldownMinutes: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Minimum gap between two alerts from this rule.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-dedup">Dedup window (min)</Label>
              <Input
                id="rule-dedup" type="number" min={0} value={form.deduplicationWindowMinutes}
                onChange={(e) => patch({ deduplicationWindowMinutes: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Repeats inside the window bump the duplicate count instead.</p>
            </div>
          </div>

          {/* Escalation section */}
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-violet-600" aria-hidden />
                <div>
                  <p className="text-sm font-medium leading-tight">Escalation</p>
                  <p className="text-[11px] text-muted-foreground">Raise severity when alerts stay unhandled</p>
                </div>
              </div>
              <Switch
                checked={form.escalationEnabled}
                onCheckedChange={(v) => patch({ escalationEnabled: v })}
                aria-label="Toggle escalation"
              />
            </div>
            {form.escalationEnabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Auto-escalate</Label>
                    <Select
                      value={form.autoEscalate ? "yes" : "no"}
                      onValueChange={(v) => patch({ autoEscalate: v === "yes" })}
                    >
                      <SelectTrigger className="h-8 text-xs" aria-label="Auto escalation mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes" className="text-xs">Yes — on interval</SelectItem>
                        <SelectItem value="no" className="text-xs">No — manual only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-esc-interval" className="text-xs">Interval (min)</Label>
                    <Input
                      id="rule-esc-interval" type="number" min={0} className="h-8 text-xs"
                      value={form.escalationIntervalMinutes}
                      onChange={(e) => patch({ escalationIntervalMinutes: e.target.value })}
                      disabled={!form.autoEscalate}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max severity ceiling</Label>
                  <Select value={form.maxSeverity} onValueChange={(v) => patch({ maxSeverity: v })}>
                    <SelectTrigger className="h-8 text-xs" aria-label="Maximum severity ceiling"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAX_SEVERITY_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <LadderEditor ladder={form.ladder} onChange={(ladder) => patch({ ladder })} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Enabled</p>
              <p className="text-[11px] text-muted-foreground">Rule fires whenever its condition is met</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              aria-label="Toggle rule enabled"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <AsyncActionButton
            label={editing ? "Update Rule" : "Create Rule"}
            pendingLabel="Saving…"
            pending={submitting}
            onClick={submit}
            variant="default"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────

export function AlertRulesPage() {
  const qc = useQueryClient();
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);

  // Test-fire result banner
  const [testResult, setTestResult] = useState<TestFireResultState | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<AlertsPayload>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<AlertsPayload>("/api/alerts"),
    refetchInterval: 30000,
  });

  const rules = useMemo(() => data?.rules ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (q && !`${r.name} ${r.condition}`.toLowerCase().includes(q)) return false;
      if (severityFilter !== "all" && normSev(r.severity) !== severityFilter) return false;
      if (statusFilter === "enabled" && !(r.enabled && !r.isSuppressed)) return false;
      if (statusFilter === "disabled" && r.enabled) return false;
      if (statusFilter === "suppressed" && !r.isSuppressed) return false;
      return true;
    });
  }, [rules, search, statusFilter, severityFilter]);

  const stats = useMemo(() => ({
    total: rules.length,
    enabled: rules.filter((r) => r.enabled).length,
    escalation: rules.filter((r) => r.escalationEnabled).length,
    suppressed: rules.filter((r) => r.isSuppressed).length,
    critical: rules.filter((r) => normSev(r.severity) === "CRITICAL").length,
  }), [rules]);

  // ── Mutations ──────────────────────────────────────────────
  const invalidate = () => { void qc.invalidateQueries({ queryKey: QUERY_KEY }); };

  const saveRule = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/alerts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(editing?.id ? "Rule updated" : "Rule created");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  const toggleRule = useMutation({
    mutationFn: (rule: AlertRule) =>
      apiFetch("/api/alerts", {
        method: "POST",
        // Backend destructures { id } — ruleId kept for older proxies.
        body: JSON.stringify({ action: "toggle-rule", id: rule.id, ruleId: rule.id }),
      }),
    onSuccess: (_res, rule) => {
      toast.success(`${rule.name} ${rule.enabled ? "disabled" : "enabled"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Toggle failed"),
  });

  const duplicateRule = useMutation({
    mutationFn: (rule: AlertRule) => {
      // Copy every field verbatim (including enabled state) under " (copy)".
      const body: Record<string, unknown> = {
        action: "create-rule",
        name: `${rule.name} (copy)`.slice(0, 120),
        condition: rule.condition ?? "",
        threshold: parseThreshold(rule.threshold),
        severity: normSev(rule.severity),
        notifyChannels: Array.isArray(rule.notifyVia) ? rule.notifyVia : [],
        cooldownMinutes: rule.cooldownMinutes ?? 5,
        enabled: !!rule.enabled,
        escalationEnabled: !!rule.escalationEnabled,
        escalationLevels: normalizeLadder(rule.escalationLevels).map((r) => ({
          afterMinutes: parseInt(r.afterMinutes, 10) || 0,
          action: r.action,
        })),
        autoEscalate: !!rule.autoEscalate,
        escalationIntervalMinutes: rule.escalationIntervalMinutes ?? 30,
        maxSeverity: normSev(rule.maxSeverity),
        deduplicationWindowMinutes: rule.deduplicationWindowMinutes ?? 10,
      };
      return apiFetch("/api/alerts", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (_res, rule) => {
      toast.success(`Rule duplicated as "${rule.name} (copy)"`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Duplicate failed"),
  });

  const suppressRule = useMutation({
    mutationFn: (rule: AlertRule) =>
      apiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({
          action: "suppress-rule",
          ruleId: rule.id, // suppress-rule accepts ruleId | alertRuleId
          reason: "Suppressed for 1 hour from Alert Rules page",
          endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      }),
    onSuccess: (_res, rule) => {
      toast.success(`${rule.name} suppressed for 1 hour`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Suppress failed"),
  });

  const deleteRule = useMutation({
    mutationFn: (rule: AlertRule) =>
      apiFetch("/api/alerts", {
        method: "POST",
        // Backend destructures { id } (old page sent ruleId → 400).
        body: JSON.stringify({ action: "delete-rule", id: rule.id }),
      }),
    onSuccess: () => {
      toast.success("Rule deleted — historical alerts are kept");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });

  const testFire = useMutation({
    mutationFn: (rule: AlertRule) =>
      apiFetch<TriggerAlertResult>("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "trigger-alert", ruleId: rule.id }),
      }),
    onSuccess: (res, rule) => {
      if (res.suppressed) {
        setTestResult({ ruleName: rule.name, outcome: "suppressed", message: res.message || "Rule is suppressed — alert not created" });
        toast.warning("Rule is suppressed — alert not created");
        invalidate();
        return;
      }
      if (res.deduplicated) {
        setTestResult({ ruleName: rule.name, outcome: "deduplicated", message: "Inside the dedup window — existing alert duplicate count incremented" });
        toast.info("Duplicate test alert — existing alert count incremented");
        invalidate();
        return;
      }
      setTestResult({ ruleName: rule.name, outcome: "fired", message: "Test alert fired — view it in Live Alerts" });
      toast.success("Test alert fired — view in Live Alerts");
      invalidate();
    },
    onError: (e: Error, rule) => {
      setTestResult({ ruleName: rule.name, outcome: "error", message: e.message || "Trigger failed" });
      toast.error(e.message || "Trigger failed");
    },
  });

  function openCreate() { setEditing(null); setDialogOpen(true); }
  function openEdit(rule: AlertRule) { setEditing(rule); setDialogOpen(true); }
  function openLiveAlerts() { setCurrentPage("Live Alerts", "ALERT MANAGEMENT"); }

  const loadError = isError ? (error instanceof Error ? error.message : "Failed to load alert rules") : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden />
            Alert Rules
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Define thresholds, dedup windows and escalation ladders that generate live alerts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules…"
              aria-label="Search alert rules"
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Filter by severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All severities</SelectItem>
              {SEVERITY_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  <span className="flex items-center gap-2"><SeverityBadge severity={s} size="xs" />{s}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden /> New Rule
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Rules" value={String(stats.total)} icon={<ClipboardList className="h-5 w-5" aria-hidden />} loading={isLoading} />
        <StatCard label="Enabled" value={String(stats.enabled)} tone="good" icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} loading={isLoading} />
        <StatCard label="With Escalation" value={String(stats.escalation)} tone="violet" icon={<TrendingUp className="h-5 w-5" aria-hidden />} loading={isLoading} />
        <StatCard label="Suppressed" value={String(stats.suppressed)} tone="violet" icon={<PauseCircle className="h-5 w-5" aria-hidden />} loading={isLoading} />
        <StatCard label="Critical Severity" value={String(stats.critical)} tone="bad" icon={<Flame className="h-5 w-5" aria-hidden />} loading={isLoading} />
      </div>

      {/* Test-fire pipeline result */}
      {testResult && (
        <TestFireBanner result={testResult} onOpenLiveAlerts={openLiveAlerts} onDismiss={() => setTestResult(null)} />
      )}

      {loadError && <ErrorStrip message={`Alert rules unavailable — ${loadError}`} onRetry={() => void refetch()} />}

      {/* Rules table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
              <span className="font-semibold text-foreground">{rules.length}</span> rules
              {isFetching && <span className="ml-2 text-[10px]">· refreshing…</span>}
            </p>
            <SeverityLegend />
          </div>
          <div className="max-h-[62vh] overflow-y-auto nice-scroll">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs">Rule</TableHead>
                  <TableHead className="text-xs">Fires On</TableHead>
                  <TableHead className="text-xs">Channels</TableHead>
                  <TableHead className="text-xs">Cooldown / Dedup</TableHead>
                  <TableHead className="text-xs">Escalation</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7} className="py-3">
                        <Skeleton className="h-9 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={ClipboardList}
                        title="No alert rules"
                        hint="Create a rule to start monitoring device metrics, uptime and capacity thresholds."
                        action={
                          <Button size="sm" className="gap-1.5" onClick={openCreate}>
                            <Plus className="h-4 w-4" aria-hidden /> New Rule
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={Search}
                        title="No rules match the current filters"
                        hint="Try clearing the search box or switching the status / severity filters."
                        action={
                          <Button
                            variant="outline" size="sm" className="gap-1.5"
                            onClick={() => { setSearch(""); setStatusFilter("all"); setSeverityFilter("all"); }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset filters
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((rule) => {
                    const suppressed = !!rule.isSuppressed;
                    return (
                      <TableRow key={rule.id} className="hover:bg-muted/30">
                        {/* Rule */}
                        <TableCell>
                          <div className="space-y-1">
                            <p className="max-w-[220px] truncate text-xs font-semibold" title={rule.name}>{rule.name}</p>
                            <code
                              className="inline-block max-w-[220px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                              title={rule.condition || "no condition"}
                            >
                              {rule.condition || "no condition"}
                            </code>
                          </div>
                        </TableCell>
                        {/* Fires On */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <SeverityBadge severity={rule.severity} />
                            <span className="max-w-[200px] truncate font-mono text-[11px]" title={firesOnLabel(rule)}>
                              {firesOnLabel(rule)}
                            </span>
                          </div>
                        </TableCell>
                        {/* Channels */}
                        <TableCell><ChannelBadgeList channels={rule.notifyVia} /></TableCell>
                        {/* Cooldown / Dedup */}
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {rule.cooldownMinutes}m / {rule.deduplicationWindowMinutes}m
                        </TableCell>
                        {/* Escalation */}
                        <TableCell><EscalationChip rule={rule} /></TableCell>
                        {/* Status */}
                        <TableCell>
                          {rule.isSuppressed ? (
                            <div className="flex flex-col items-start gap-1">
                              <Badge variant="outline" className={`gap-1 text-[10px] font-semibold ${VIOLET_BADGE}`}>
                                <PauseCircle className="h-2.5 w-2.5" aria-hidden /> Suppressed
                              </Badge>
                              <CountdownChip endsAt={rule.activeSuppression?.endsAt ?? null} />
                            </div>
                          ) : (
                            <EnabledSwitch
                              checked={rule.enabled}
                              onChange={() => toggleRule.mutate(rule)}
                              ariaLabel={`Toggle ${rule.name}`}
                            />
                          )}
                        </TableCell>
                        {/* Actions */}
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <AsyncActionButton
                              label="Test Fire"
                              pendingLabel="Firing…"
                              pending={testFire.isPending && testFire.variables?.id === rule.id}
                              icon={<Flame className="h-3.5 w-3.5" aria-hidden />}
                              onClick={() => testFire.mutate(rule)}
                              variant="outline"
                            />
                            <Button
                              variant="outline" size="sm" className="h-7 w-7 p-0"
                              onClick={() => openEdit(rule)} title="Edit" aria-label={`Edit ${rule.name}`}
                            >
                              <Pencil className="h-3 w-3" aria-hidden />
                            </Button>
                            <Button
                              variant="outline" size="sm" className="h-7 w-7 p-0"
                              onClick={() => duplicateRule.mutate(rule)}
                              disabled={duplicateRule.isPending && duplicateRule.variables?.id === rule.id}
                              title="Duplicate rule" aria-label={`Duplicate ${rule.name}`}
                            >
                              <Copy className="h-3 w-3" aria-hidden />
                            </Button>
                            {!suppressed && (
                              <Button
                                variant="outline" size="sm" className="h-7 w-7 p-0 text-violet-600"
                                onClick={() => suppressRule.mutate(rule)}
                                disabled={suppressRule.isPending && suppressRule.variables?.id === rule.id}
                                title="Suppress for 1 hour" aria-label={`Suppress ${rule.name} for one hour`}
                              >
                                <ShieldAlert className="h-3 w-3" aria-hidden />
                              </Button>
                            )}
                            <Button
                              variant="outline" size="sm" className="h-7 w-7 p-0 text-red-600"
                              onClick={() => setDeleteTarget(rule)} title="Delete rule" aria-label={`Delete ${rule.name}`}
                            >
                              <Trash2 className="h-3 w-3" aria-hidden />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <RuleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        submitting={saveRule.isPending}
        onSubmit={(body) => saveRule.mutate(body)}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alert rule?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> will stop generating alerts immediately.
              Historical alerts are kept. Active suppressions for this rule are removed with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteRule.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteRule.mutate(deleteTarget);
              }}
            >
              {deleteRule.isPending ? "Deleting…" : "Delete Rule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AlertRulesPage;
