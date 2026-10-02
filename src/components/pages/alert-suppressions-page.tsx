"use client";

// ═══════════════════════════════════════════════════════════════
// Alert Suppressions — production rebuild (Task 2-b)
// Rule suppressions + maintenance windows against GET/POST
// /api/alerts. Violet is the domain accent for the suppression
// state machine (matching the alerts shared kit).
//
// API contract (verified against src/app/api/alerts/route.ts):
// • GET /api/alerts → { rules, suppressions, maintenanceWindows,
//   stats, … }. NOTE: the suppressions list only contains windows
//   that are active RIGHT NOW (startsAt ≤ now AND (endsAt null OR
//   endsAt ≥ now)) — expired rows never reach the client, so the
//   "Expired" stat is derived defensively and normally reads 0;
//   "Cleanup Expired" still reports how many historical rows it
//   removed server-side. Same for maintenance windows: only
//   scheduled / IN PROGRESS windows with endTime ≥ now are returned.
// • POST suppress-rule { ruleId | alertRuleId, reason, startsAt?,
//   endsAt? } — endsAt null means "until manually lifted".
// • POST unsuppress-rule { suppressionId } lifts exactly one row
//   ({ ruleId } would lift all active windows for that rule).
// • POST extend-suppression { suppressionId, endsAt, reason? } —
//   omitted reason keeps the stored one; endsAt null clears the
//   window end (converts to manual).
// • POST cleanup-suppressions → { success, count }.
// • trigger-alert enforces suppression → maintenance window → dedup
//   server-side; this page only visualizes those gates.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Clock3, Eraser, Hourglass, PauseCircle, Pencil,
  Play, Plus, RotateCcw, Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/utils";
import {
  AsyncActionButton, CountdownChip, EmptyState, formatTimestamp, timeAgo, WarningStrip,
} from "@/components/alerts/shared";

// ─── Types ───────────────────────────────────────────────────

interface Suppression {
  id: string;
  alertRuleId: string | null;
  reason: string;
  suppressedBy: string;
  startsAt: string;
  endsAt: string | null; // null = until manually lifted
}

interface MaintenanceWindow {
  id: string;
  title: string;
  description: string;
  scheduledAt: string;
  endTime: string;
  affectedAreaIds: string[];
  status: string; // "scheduled" | "IN PROGRESS" | "completed"
}

interface RuleLite {
  id: string;
  name: string;
}

interface AlertsPayload {
  rules?: RuleLite[];
  suppressions?: Suppression[];
  maintenanceWindows?: MaintenanceWindow[];
  stats?: { active: number; today: number; acknowledged: number; resolved: number };
}

interface CleanupResult {
  success?: boolean;
  count?: number;
}

interface ExtendTarget {
  suppression: Suppression;
  ruleName: string;
}

// ─── Constants ───────────────────────────────────────────────

const QUERY_KEY = ["alert-suppressions-page"] as const;
const HOUR_MS = 60 * 60 * 1000;

const DURATION_PICKS = [
  { minutes: 30, label: "30m" },
  { minutes: 60, label: "1h" },
  { minutes: 240, label: "4h" },
  { minutes: 480, label: "8h" },
  { minutes: 1440, label: "24h" },
  { minutes: 0, label: "Until lifted" },
] as const;

const VIOLET_BADGE =
  "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300";
const SKY_BADGE =
  "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300";

// ─── Time helpers ────────────────────────────────────────────

function ts(v: string | null | undefined): number {
  const n = new Date(v ?? "").getTime();
  return Number.isNaN(n) ? NaN : n;
}

/** Active = no end, or end in the future (defensive — server pre-filters). */
function isSuppressionActive(s: Suppression): boolean {
  const end = ts(s.endsAt);
  return !s.endsAt || (Number.isFinite(end) && end > Date.now());
}

function isSuppressionExpired(s: Suppression): boolean {
  const end = ts(s.endsAt);
  return !!s.endsAt && Number.isFinite(end) && end <= Date.now();
}

function isExpiringWithinHour(s: Suppression): boolean {
  const end = ts(s.endsAt);
  return isSuppressionActive(s) && !!s.endsAt && Number.isFinite(end) && end - Date.now() < HOUR_MS;
}

function windowCoversNow(m: MaintenanceWindow): boolean {
  const start = ts(m.scheduledAt);
  const end = ts(m.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && start <= Date.now() && end >= Date.now();
}

/** "2026-01-05T14:30" for <input type="datetime-local"> in local time. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local value → ISO string, or null when cleared. */
function fromLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Relative label for a FUTURE timestamp (shared timeAgo is past-only). */
function inLabel(iso: string | null | undefined): string {
  const end = ts(iso);
  if (!iso || !Number.isFinite(end)) return "no end";
  const mins = Math.max(0, Math.round((end - Date.now()) / 60000));
  if (mins < 1) return "ending now";
  if (mins < 60) return `${mins}m from now`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m from now`;
}

// ─── Local UI atoms ──────────────────────────────────────────

function StatCard({ label, value, tone = "default", icon, loading, hint }: {
  label: string; value: string; tone?: "default" | "good" | "bad" | "warn" | "violet";
  icon: ReactNode; loading?: boolean; hint?: string;
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
            {hint && <span className="block truncate text-[10px] text-muted-foreground">{hint}</span>}
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

function SuppressingBadge() {
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] font-semibold ${VIOLET_BADGE}`}>
      <PauseCircle className="h-2.5 w-2.5" aria-hidden /> Suppressing
    </Badge>
  );
}

function ExpiredBadge() {
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">Expired</Badge>;
}

function MaintenanceStatusBadge({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  if (s === "IN PROGRESS") {
    return <Badge variant="outline" className={`text-[10px] font-semibold ${VIOLET_BADGE}`}>In Progress</Badge>;
  }
  if (s === "SCHEDULED") {
    return <Badge variant="outline" className={`text-[10px] font-semibold ${SKY_BADGE}`}>Scheduled</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">{status || "Unknown"}</Badge>;
}

/** Live indicator for "is the current time inside this window?". */
function CoverageIndicator({ win }: { win: MaintenanceWindow }) {
  if (windowCoversNow(win)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        Inside window — alerts suppressed
      </span>
    );
  }
  const start = ts(win.scheduledAt);
  if (Number.isFinite(start) && start > Date.now()) {
    const mins = Math.round((start - Date.now()) / 60000);
    const label = mins < 60 ? `starts in ${mins}m` : `starts in ${Math.floor(mins / 60)}h ${mins % 60}m`;
    return <span className="text-[10px] text-sky-600 dark:text-sky-400">{label}</span>;
  }
  return <span className="text-[10px] text-muted-foreground">outside window</span>;
}

// ─── New suppression dialog ──────────────────────────────────

function NewSuppressionDialog({ open, onOpenChange, rules, submitting, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: RuleLite[];
  submitting: boolean;
  onSubmit: (body: { ruleId: string; reason: string; endsAt: string | null }) => void;
}) {
  const [ruleId, setRuleId] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState<number>(60);
  const [customEnd, setCustomEnd] = useState("");

  const endsAt = customEnd.trim() ? fromLocalInput(customEnd) : minutes === 0 ? null : new Date(Date.now() + minutes * 60000).toISOString();

  function reset() {
    setRuleId(""); setReason(""); setMinutes(60); setCustomEnd("");
  }

  function submit() {
    if (!ruleId) { toast.error("Pick a rule to suppress"); return; }
    if (!reason.trim()) { toast.error("A reason is required — it is shown in the audit trail"); return; }
    onSubmit({ ruleId, reason: reason.trim(), endsAt });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle>New Suppression</DialogTitle>
          <DialogDescription>
            Temporarily silence one alert rule — no alerts are created while the window is open.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="space-y-1.5">
            <Label>Rule <span className="text-red-500">*</span></Label>
            <Select value={ruleId} onValueChange={setRuleId}>
              <SelectTrigger aria-label="Rule to suppress">
                <SelectValue placeholder={rules.length === 0 ? "No rules available" : "Select rule"} />
              </SelectTrigger>
              <SelectContent>
                {rules.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rules.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Create an alert rule first — suppressions are rule-scoped.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="suppression-reason">Reason <span className="text-red-500">*</span></Label>
            <Input
              id="suppression-reason" value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Scheduled OLT firmware upgrade"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Duration</Label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PICKS.map((p) => {
                const active = !customEnd.trim() && minutes === p.minutes;
                return (
                  <Button
                    key={p.label} type="button" variant={active ? "default" : "outline"}
                    size="sm" className="h-7 px-2.5 text-xs"
                    onClick={() => { setMinutes(p.minutes); setCustomEnd(""); }}
                    aria-pressed={active}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
            <div className="pt-1">
              <Label htmlFor="suppression-ends-at" className="text-xs">Or pick an exact end time</Label>
              <Input
                id="suppression-ends-at" type="datetime-local" className="mt-1 h-8 text-xs"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                aria-label="Custom suppression end time"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">An exact end time overrides the quick picks above.</p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            {endsAt ? (
              <>
                <p className="font-medium">Window preview</p>
                <p className="mt-0.5 text-muted-foreground">
                  Suppression starts now and ends {formatTimestamp(endsAt)} —
                  <span className="ml-1 inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden />{inLabel(endsAt)}</span>
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Manual window</p>
                <p className="mt-0.5 text-muted-foreground">No end time — the suppression stays until someone lifts it.</p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <AsyncActionButton
            label="Suppress Rule"
            pendingLabel="Suppressing…"
            pending={submitting}
            icon={<PauseCircle className="h-3.5 w-3.5" aria-hidden />}
            onClick={submit}
            variant="default"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Extend dialog (custom end time + reason edit) ───────────

function ExtendSuppressionDialog({ target, submitting, onSubmit, onClose }: {
  target: ExtendTarget | null;
  submitting: boolean;
  onSubmit: (body: { suppressionId: string; endsAt: string | null; reason: string }) => void;
  onClose: () => void;
}) {
  const seededFor = target?.suppression.id ?? null;
  const [seededId, setSeededId] = useState<string | null>(null);
  const [endsAtInput, setEndsAtInput] = useState("");
  const [reason, setReason] = useState("");

  // Seed once per opened target (state-during-render hydration pattern).
  if (target && seededId !== seededFor) {
    const s = target.suppression;
    setEndsAtInput(s.endsAt ? toLocalInput(new Date(s.endsAt)) : toLocalInput(new Date(Date.now() + HOUR_MS)));
    setReason(s.reason ?? "");
    setSeededId(s.id);
  }
  if (!target && seededId !== null) setSeededId(null);

  const endsAt = fromLocalInput(endsAtInput);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle>Extend Suppression</DialogTitle>
          <DialogDescription>
            {target ? `Window for ${target.ruleName}` : "Window"} — clearing the end time converts it to “until lifted”.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="extend-ends-at">Ends at</Label>
              <Button
                type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                onClick={() => setEndsAtInput("")}
              >
                Until lifted (no end)
              </Button>
            </div>
            <Input
              id="extend-ends-at" type="datetime-local" className="h-9 text-xs"
              value={endsAtInput}
              onChange={(e) => setEndsAtInput(e.target.value)}
              aria-label="Suppression end time"
            />
            <p className="text-[10px] text-muted-foreground">
              {endsAt ? `Ends ${formatTimestamp(endsAt)}` : "No end time — lift manually when work completes."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="extend-reason">Reason</Label>
            <Input
              id="extend-reason" value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Upgrade running past the window"
            />
            <p className="text-[10px] text-muted-foreground">Updating the reason replaces the stored one.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <AsyncActionButton
            label="Extend Window"
            pendingLabel="Extending…"
            pending={submitting}
            icon={<Clock3 className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => {
              if (!target) return;
              if (!reason.trim()) { toast.error("A reason is required"); return; }
              onSubmit({ suppressionId: target.suppression.id, endsAt, reason: reason.trim() });
            }}
            variant="default"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────

export function AlertSuppressionsPage() {
  const qc = useQueryClient();

  const [tab, setTab] = useState("suppressions");
  const [createOpen, setCreateOpen] = useState(false);
  const [extendTarget, setExtendTarget] = useState<ExtendTarget | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<AlertsPayload>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<AlertsPayload>("/api/alerts"),
    refetchInterval: 30000,
  });

  const rules = useMemo(() => data?.rules ?? [], [data]);
  const suppressions = useMemo(() => data?.suppressions ?? [], [data]);
  const windows = useMemo(() => data?.maintenanceWindows ?? [], [data]);

  const ruleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rules) map.set(r.id, r.name);
    return map;
  }, [rules]);

  function ruleNameOf(s: Suppression): string {
    if (!s.alertRuleId) return "All rules";
    return ruleNameById.get(s.alertRuleId) ?? "Unknown rule";
  }

  const stats = useMemo(() => {
    const active = suppressions.filter(isSuppressionActive);
    return {
      active: active.length,
      expiring: active.filter(isExpiringWithinHour).length,
      expired: suppressions.filter(isSuppressionExpired).length,
      windowsNow: windows.filter(windowCoversNow).length,
    };
  }, [suppressions, windows]);

  // ── Mutations ──────────────────────────────────────────────
  const invalidate = () => { void qc.invalidateQueries({ queryKey: QUERY_KEY }); };

  const createSuppression = useMutation({
    mutationFn: (body: { ruleId: string; reason: string; endsAt: string | null }) =>
      apiFetch("/api/alerts", {
        method: "POST",
        // suppress-rule accepts ruleId | alertRuleId; suppressedBy falls
        // back to the authenticated session user server-side.
        body: JSON.stringify({ action: "suppress-rule", ruleId: body.ruleId, reason: body.reason, endsAt: body.endsAt }),
      }),
    onSuccess: () => {
      toast.success("Suppression created — the rule will not generate alerts until the window ends");
      setCreateOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Suppress failed"),
  });

  const liftSuppression = useMutation({
    mutationFn: (s: Suppression) =>
      apiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "unsuppress-rule", suppressionId: s.id }),
      }),
    onSuccess: () => {
      toast.success("Suppression lifted — rule resumes alerting");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Lift failed"),
  });

  const extendSuppression = useMutation({
    mutationFn: (body: { suppressionId: string; endsAt: string | null; reason?: string }) =>
      apiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "extend-suppression", ...body }),
      }),
    onSuccess: (_res, variables) => {
      toast.success(
        variables.endsAt
          ? `Suppression extended to ${formatTimestamp(variables.endsAt)}`
          : "Suppression converted to “until lifted”",
      );
      setExtendTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Extend failed"),
  });

  const cleanupExpired = useMutation({
    mutationFn: () => apiFetch<CleanupResult>("/api/alerts", {
      method: "POST",
      body: JSON.stringify({ action: "cleanup-suppressions" }),
    }),
    onSuccess: (res) => {
      const count = Number(res.count ?? 0);
      if (count > 0) toast.success(`${count} expired suppression${count === 1 ? "" : "s"} removed`);
      else toast.info("No expired suppressions to remove");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Cleanup failed"),
  });

  function quickExtend(s: Suppression, hours: number) {
    extendSuppression.mutate({
      suppressionId: s.id,
      endsAt: new Date(Date.now() + hours * HOUR_MS).toISOString(),
    });
  }

  const loadError = isError ? (error instanceof Error ? error.message : "Failed to load suppressions") : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <PauseCircle className="h-5 w-5 text-violet-600" aria-hidden />
            Alert Suppressions
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Maintenance windows that temporarily silence alert rules during planned work.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AsyncActionButton
            label="Cleanup Expired"
            pendingLabel="Cleaning…"
            pending={cleanupExpired.isPending}
            icon={<Eraser className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => cleanupExpired.mutate()}
          />
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New Suppression
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Now" value={String(stats.active)} tone="violet" loading={isLoading}
          icon={<PauseCircle className="h-5 w-5" aria-hidden />}
          hint="rules currently silenced"
        />
        <StatCard
          label="Expiring < 1h" value={String(stats.expiring)} tone="warn" loading={isLoading}
          icon={<Hourglass className="h-5 w-5" aria-hidden />}
          hint="windows ending soon"
        />
        <StatCard
          label="Expired" value={String(stats.expired)} loading={isLoading}
          icon={<RotateCcw className="h-5 w-5" aria-hidden />}
          hint="removed by cleanup"
        />
        <StatCard
          label="Maintenance Windows" value={String(stats.windowsNow)} tone="good" loading={isLoading}
          icon={<Wrench className="h-5 w-5" aria-hidden />}
          hint="covering the current time"
        />
      </div>

      {loadError && <ErrorStrip message={`Suppressions unavailable — ${loadError}`} onRetry={() => void refetch()} />}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="suppressions" className="gap-1.5">
            <PauseCircle className="h-3.5 w-3.5" aria-hidden /> Rule Suppressions
            <Badge variant="secondary" className="ml-1 tabular-nums">{suppressions.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" aria-hidden /> Maintenance Windows
            <Badge variant="secondary" className="ml-1 tabular-nums">{windows.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Rule suppressions tab ── */}
        <TabsContent value="suppressions" className="space-y-4">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{suppressions.length}</span> suppression
                  {suppressions.length === 1 ? "" : "s"} in effect
                  {isFetching && <span className="ml-2 text-[10px]">· refreshing…</span>}
                </p>
                <p className="text-[10px] text-muted-foreground">Suppressed rules generate no alerts — even on Test Fire.</p>
              </div>
              <div className="max-h-[62vh] overflow-y-auto nice-scroll">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs">Rule</TableHead>
                      <TableHead className="text-xs">Reason</TableHead>
                      <TableHead className="text-xs">By</TableHead>
                      <TableHead className="text-xs">Started</TableHead>
                      <TableHead className="text-xs">Window</TableHead>
                      <TableHead className="text-xs">State</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={7} className="py-3"><Skeleton className="h-9 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : suppressions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <EmptyState
                            icon={PauseCircle}
                            title="No active suppressions"
                            hint="All alert rules are live. Create a suppression before planned maintenance so known work does not page on-call."
                            action={
                              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                                <Plus className="h-4 w-4" aria-hidden /> New Suppression
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      suppressions.map((s) => {
                        const active = isSuppressionActive(s);
                        return (
                          <TableRow key={s.id} className="hover:bg-muted/30">
                            <TableCell>
                              <p className="max-w-[200px] truncate text-xs font-semibold" title={ruleNameOf(s)}>
                                {ruleNameOf(s)}
                              </p>
                            </TableCell>
                            <TableCell>
                              <p className="max-w-[240px] truncate text-xs text-muted-foreground" title={s.reason}>
                                {s.reason || "—"}
                              </p>
                            </TableCell>
                            <TableCell className="text-xs">{s.suppressedBy || "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="whitespace-nowrap text-xs">{formatTimestamp(s.startsAt)}</span>
                                <span className="text-[10px] text-muted-foreground">{timeAgo(s.startsAt)}</span>
                              </div>
                            </TableCell>
                            <TableCell><CountdownChip endsAt={s.endsAt} /></TableCell>
                            <TableCell>{active ? <SuppressingBadge /> : <ExpiredBadge />}</TableCell>
                            <TableCell>
                              {active ? (
                                <div className="flex items-center justify-end gap-1">
                                  <AsyncActionButton
                                    label="Lift"
                                    pendingLabel="Lifting…"
                                    pending={liftSuppression.isPending && liftSuppression.variables?.id === s.id}
                                    icon={<Play className="h-3.5 w-3.5" aria-hidden />}
                                    onClick={() => liftSuppression.mutate(s)}
                                  />
                                  <Button
                                    variant="outline" size="sm" className="h-7 px-2 text-[10px] font-semibold"
                                    onClick={() => quickExtend(s, 1)}
                                    disabled={extendSuppression.isPending && extendSuppression.variables?.suppressionId === s.id}
                                    title="Extend by 1 hour" aria-label={`Extend suppression of ${ruleNameOf(s)} by one hour`}
                                  >
                                    +1h
                                  </Button>
                                  <Button
                                    variant="outline" size="sm" className="h-7 px-2 text-[10px] font-semibold"
                                    onClick={() => quickExtend(s, 4)}
                                    disabled={extendSuppression.isPending && extendSuppression.variables?.suppressionId === s.id}
                                    title="Extend by 4 hours" aria-label={`Extend suppression of ${ruleNameOf(s)} by four hours`}
                                  >
                                    +4h
                                  </Button>
                                  <Button
                                    variant="outline" size="sm" className="h-7 w-7 p-0"
                                    onClick={() => setExtendTarget({ suppression: s, ruleName: ruleNameOf(s) })}
                                    title="Set custom end time" aria-label={`Edit suppression window of ${ruleNameOf(s)}`}
                                  >
                                    <Pencil className="h-3 w-3" aria-hidden />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
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
        </TabsContent>

        {/* ── Maintenance windows tab ── */}
        <TabsContent value="maintenance" className="space-y-4">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{windows.length}</span> scheduled or in-progress
                  window{windows.length === 1 ? "" : "s"}
                  {isFetching && <span className="ml-2 text-[10px]">· refreshing…</span>}
                </p>
                <p className="text-[10px] text-muted-foreground">Alerts are auto-suppressed while a window covers the current time.</p>
              </div>
              <div className="max-h-[62vh] overflow-y-auto nice-scroll">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs">Window</TableHead>
                      <TableHead className="text-xs">Start</TableHead>
                      <TableHead className="text-xs">End</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Coverage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={5} className="py-3"><Skeleton className="h-9 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : windows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <EmptyState
                            icon={Wrench}
                            title="No maintenance windows scheduled"
                            hint="Windows created from the network planner appear here while they are scheduled or in progress."
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      windows.map((m) => (
                        <TableRow key={m.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="max-w-[260px] truncate text-xs font-semibold" title={m.title}>{m.title}</p>
                              {m.description && (
                                <p className="max-w-[260px] truncate text-[10px] text-muted-foreground" title={m.description}>
                                  {m.description}
                                </p>
                              )}
                              {Array.isArray(m.affectedAreaIds) && m.affectedAreaIds.length > 0 && (
                                <p className="text-[10px] text-muted-foreground">{m.affectedAreaIds.length} area(s) affected</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatTimestamp(m.scheduledAt)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatTimestamp(m.endTime)}</TableCell>
                          <TableCell><MaintenanceStatusBadge status={m.status} /></TableCell>
                          <TableCell><CoverageIndicator win={m} /></TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <WarningStrip>
            Alerts are auto-suppressed during maintenance windows — the trigger-alert pipeline checks active windows
            after rule suppression and before deduplication, so no page is created for work inside a window.
          </WarningStrip>
        </TabsContent>
      </Tabs>

      {/* Footer note */}
      <WarningStrip>
        Suppressed rules generate NO alerts until the window ends or the suppression is lifted — Test Fire on a
        suppressed rule is swallowed too. Maintenance windows are enforced globally by the trigger pipeline
        (suppression check → maintenance window check → deduplication).
      </WarningStrip>

      {/* Dialogs */}
      <NewSuppressionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        rules={rules}
        submitting={createSuppression.isPending}
        onSubmit={(body) => createSuppression.mutate(body)}
      />
      <ExtendSuppressionDialog
        target={extendTarget}
        submitting={extendSuppression.isPending}
        onSubmit={(body) => extendSuppression.mutate(body)}
        onClose={() => setExtendTarget(null)}
      />
    </div>
  );
}

export default AlertSuppressionsPage;
