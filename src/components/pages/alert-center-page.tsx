"use client";

// ═══════════════════════════════════════════════════════════════
// Alert Center — mission-control dashboard for the ALERT MANAGEMENT module.
//
// Live active feed + escalation queue + resolution analytics, all fed by:
//   GET  /api/alerts               → ACTIVE + ACKNOWLEDGED alerts, rules, users,
//                                    suppressions, maintenance windows, stats
//   GET  /api/alerts/analytics     → dailyTrend / severityDistribution /
//                                    topSources / summary (resolve rate, MTTR)
//   POST /api/alerts {action:...}  → acknowledge | resolve | escalate-alert |
//                                    add-comment | get-comments
//
// Design language mirrors the INTEGRATIONS module (commit b70d7a0):
// cards border shadow-sm rounded-xl, icon chips, text-[10px] metadata,
// semantic colors only (red/orange/amber/emerald/sky/violet). No emojis.
//
// NOTE ON API FIELD NAMES (verified against src/app/api/alerts/route.ts):
// the backend maps Prisma rows to camelCase with `triggeredAt` (created),
// `device` (deviceId || source) and CAPITALIZED enums ("Critical"/"Active").
// The shared kit normalizes severity/status, so both shapes render fine.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Bell, BellRing,
  CheckCircle2, CheckCheck, ChevronUp, ClipboardList, Clock3, History,
  Layers, Loader2, MessageSquare, PauseCircle, RotateCcw, Send, Siren,
  Timer, TrendingUp, Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/utils";
import {
  AsyncActionButton, EmptyState, LivePulse, MiniStat, SeverityLegend,
  SEVERITY_META, SEVERITY_ORDER, SeverityBadge, StatusBadge,
  formatTimestamp, normalizeSeverity, normalizeStatus, timeAgo,
} from "@/components/alerts/shared";

// ─── API payload types (verified against route handlers) ────────

interface LiveAlert {
  id: string;
  severity: string;              // "Critical" | "High" | "Medium" | "Low"
  type: string;                  // rule name || title || "Custom"
  title: string;
  message: string;
  device: string;                // deviceId || source
  area: string;
  triggeredAt: string;           // ISO — creation timestamp
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolution: string;
  status: string;                // "Active" | "Acknowledged" | ...
  assignedTo: string;
  assignedToId: string | null;
  assignedToEmail: string;
  ruleId: string;
  duplicateCount: number;
  isDuplicate: boolean;
  escalationLevel: number;
  isSuppressed: boolean;
  escalationEnabled: boolean;
  escalationLevels: unknown[];
  rule?: { id?: string; name?: string } | null;
}

interface AlertsPayload {
  alerts: LiveAlert[];
  rules: Array<{ id: string; name: string; severity: string; enabled: boolean; isSuppressed: boolean }>;
  users: Array<{ id: string; name: string; email: string; role?: string }>;
  suppressions: Array<{ id: string; alertRuleId: string; reason: string; suppressedBy: string; startsAt: string; endsAt: string | null }>;
  maintenanceWindows: Array<{ id: string; title: string; scheduledAt: string; endTime: string; status: string }>;
  stats: { active: number; today: number; acknowledged: number; resolved: number };
}

interface Analytics {
  dailyTrend: Array<{ date: string; total?: number; count?: number }>;
  severityDistribution: Array<{ severity: string; count: number }>;
  topSources: Array<{ ruleId: string | null; name: string; count: number }>;
  summary: {
    totalAlerts: number; resolvedCount: number; avgResolutionMin: number;
    medianResolutionMin: number; resolveRate: number;
  };
}

interface AlertComment {
  id: string;
  message: string;
  createdAt: string;
  User?: { name?: string; email?: string } | null;
}

// ─── Detail-dialog data shape (shared with Alert History page) ──
// The history route returns a slightly narrower row; both pages map
// their payloads into this shape and share one dialog component.

export interface AlertDetailData {
  id: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  source?: string;
  device?: string;
  ruleName?: string;
  triggeredAt?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  assignedTo?: string | null;
  resolvedAt?: string | null;
  resolution?: string | null;
  duplicateCount?: number;
  escalationLevel?: number;
}

export function toAlertDetailData(a: LiveAlert): AlertDetailData {
  return {
    id: a.id,
    title: a.title || a.type || "Untitled alert",
    message: a.message,
    severity: a.severity,
    status: a.status,
    source: a.device || undefined,
    device: a.device || undefined,
    ruleName: a.rule?.name || a.type || undefined,
    triggeredAt: a.triggeredAt,
    acknowledgedAt: a.acknowledgedAt,
    acknowledgedBy: a.assignedTo || null,
    assignedTo: a.assignedTo || null,
    resolvedAt: a.resolvedAt,
    resolution: a.resolution || null,
    duplicateCount: a.duplicateCount,
    escalationLevel: a.escalationLevel,
  };
}

// ─── Constants ──────────────────────────────────────────────────

type RangeDays = 7 | 14 | 30;

const RANGE_OPTIONS: Array<{ value: string; label: string; days: RangeDays }> = [
  { value: "7", label: "7d", days: 7 },
  { value: "14", label: "14d", days: 14 },
  { value: "30", label: "30d", days: 30 },
];

const REFRESH_OPTIONS = [
  { value: "15000", label: "15 seconds" },
  { value: "30000", label: "30 seconds" },
  { value: "60000", label: "60 seconds" },
  { value: "0", label: "Paused" },
];

const FEED_PAGE_SIZE = 50;

const QUICK_LINKS = [
  { label: "Live Alerts", href: "/network-alerts", icon: Siren, chip: "bg-red-100", iconColor: "text-red-600", desc: "Acknowledge, assign and resolve" },
  { label: "Alert Rules", href: "/alert-rules", icon: ClipboardList, chip: "bg-sky-100", iconColor: "text-sky-600", desc: "Thresholds and escalation ladders" },
  { label: "Suppressions", href: "/alert-suppressions", icon: PauseCircle, chip: "bg-violet-100", iconColor: "text-violet-600", desc: "Maintenance windows and silences" },
  { label: "Alert History", href: "/alert-history", icon: History, chip: "bg-emerald-100", iconColor: "text-emerald-600", desc: "Resolved alert archive" },
  { label: "Notification Rules", href: "/notification-rules", icon: Bell, chip: "bg-amber-100", iconColor: "text-amber-600", desc: "Event to channel routing" },
];

// ─── Small local components ─────────────────────────────────────

function ErrorStrip({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "default", icon, iconChip, hint, loading }: {
  label: string; value: string;
  tone?: "default" | "good" | "bad" | "warn";
  icon: ReactNode; iconChip: string; hint?: string; loading?: boolean;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconChip}`}>
          {icon}
        </div>
        {loading ? (
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <MiniStat label={label} value={value} tone={tone} />
            {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, description, icon, iconChip, countBadge, action, children, contentClassName }: {
  title: string; description?: string; icon: ReactNode; iconChip: string;
  countBadge?: ReactNode; action?: ReactNode; children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <Card className="border shadow-sm rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconChip}`}>
              {icon}
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                {title}
                {countBadge}
              </CardTitle>
              {description && <CardDescription className="mt-0.5 text-xs">{description}</CardDescription>}
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

function EscalationLevelBadge({ level }: { level: number }) {
  if (level <= 0) {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <Clock3 className="mr-1 h-2.5 w-2.5" aria-hidden /> 2H+ UNACK
      </Badge>
    );
  }
  const cls = level >= 2
    ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
    : "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300";
  return (
    <Badge variant="outline" className={`text-[9px] font-semibold ${cls}`}>
      <Zap className="mr-1 h-2.5 w-2.5" aria-hidden /> L{level}
    </Badge>
  );
}

function SourceChip({ source }: { source?: string }) {
  if (!source) return null;
  return (
    <Badge variant="secondary" className="max-w-[140px] truncate font-mono text-[9px] font-normal">
      {source}
    </Badge>
  );
}

function initialsOf(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function formatTrendDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function trendCount(point: { total?: number; count?: number }): number {
  return point.total ?? point.count ?? 0;
}

// ═══════════════════════════════════════════════════════════════
// Alert Detail Dialog — shared by Alert Center AND Alert History.
// Self-contained: comments thread, timeline, resolve step and the
// acknowledge / resolve / escalate footer, driven by POST /api/alerts.
// ═══════════════════════════════════════════════════════════════

export function AlertDetailDialog({ alert, open, onOpenChange, initialMode = "view" }: {
  alert: AlertDetailData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "view" | "resolve";
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"view" | "resolve">(initialMode);
  const [resolutionNote, setResolutionNote] = useState("");
  const [commentDraft, setCommentDraft] = useState("");

  // Reset transient state whenever a different alert opens.
  const alertId = alert?.id ?? null;
  const [lastAlertId, setLastAlertId] = useState<string | null>(null);
  if (alertId !== lastAlertId) {
    setLastAlertId(alertId);
    setMode(initialMode);
    setResolutionNote("");
    setCommentDraft("");
  }

  const status = normalizeStatus(alert?.status);
  const canAct = status === "ACTIVE" || status === "ACKNOWLEDGED";

  // ── Comments (GET via POST action get-comments) ───────────────
  const commentsQuery = useQuery<{ success: boolean; data: AlertComment[] }>({
    queryKey: ["alert-comments", alertId ?? "none"],
    enabled: open && !!alertId,
    refetchInterval: false,
    queryFn: () =>
      apiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "get-comments", alertId }),
      }),
  });
  const comments = commentsQuery.data?.data ?? [];

  const invalidateAlertScopes = () => {
    void queryClient.invalidateQueries({ queryKey: ["alert-center-live"] });
    void queryClient.invalidateQueries({ queryKey: ["alert-center-analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["alert-history"] });
    void queryClient.invalidateQueries({ queryKey: ["alert-comments", alertId] });
  };

  // ── Mutations ─────────────────────────────────────────────────
  const acknowledgeMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch("/api/alerts", { method: "POST", body: JSON.stringify({ action: "acknowledge", id }) }),
    onSuccess: () => { toast.success("Alert acknowledged"); invalidateAlertScopes(); },
    onError: (e: Error) => toast.error(e.message || "Acknowledge failed"),
  });

  const resolveMut = useMutation({
    mutationFn: (vars: { id: string; resolution: string }) =>
      apiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "resolve", id: vars.id, resolution: vars.resolution }),
      }),
    onSuccess: () => {
      toast.success("Alert resolved");
      setMode("view");
      setResolutionNote("");
      invalidateAlertScopes();
    },
    onError: (e: Error) => toast.error(e.message || "Resolve failed"),
  });

  const escalateMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ newSeverity?: string }>("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "escalate-alert", id }),
      }),
    onSuccess: (res) => {
      toast.success(`Escalated${res?.newSeverity ? ` — severity raised to ${res.newSeverity}` : ""}`);
      invalidateAlertScopes();
    },
    onError: (e: Error) => toast.error(e.message || "Escalation failed"),
  });

  const commentMut = useMutation({
    mutationFn: (vars: { alertId: string; message: string }) =>
      apiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "add-comment", alertId: vars.alertId, message: vars.message }),
      }),
    onSuccess: () => {
      toast.success("Comment added");
      setCommentDraft("");
      invalidateAlertScopes();
    },
    onError: (e: Error) => toast.error(e.message || "Comment failed"),
  });

  if (!alert) return null;
  const busy = acknowledgeMut.isPending || resolveMut.isPending || escalateMut.isPending;
  const showResolveStep = mode === "resolve" && status !== "RESOLVED";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto nice-scroll sm:max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <SeverityBadge severity={alert.severity} />
            <StatusBadge status={alert.status} />
            {(alert.escalationLevel ?? 0) > 0 && <EscalationLevelBadge level={alert.escalationLevel ?? 0} />}
            {(alert.duplicateCount ?? 1) > 1 && (
              <Badge variant="secondary" className="text-[10px]">x{alert.duplicateCount} occurrences</Badge>
            )}
          </div>
          <DialogTitle className="text-base leading-snug">{alert.title || "Alert details"}</DialogTitle>
          <DialogDescription className="text-xs">
            {alert.ruleName ? `Rule: ${alert.ruleName}` : "Manual alert"}
            {alert.id ? <span className="ml-2 font-mono text-[10px]">{alert.id}</span> : null}
          </DialogDescription>
        </DialogHeader>

        {showResolveStep ? (
          // ── Resolve step ────────────────────────────────────────
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              Closing this alert marks it RESOLVED. Add a resolution note for the audit trail — it is shown
              highlighted on the Alert History page.
            </div>
            <Textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={4}
              placeholder="What was the root cause and what fixed it?"
              aria-label="Resolution note"
              className="text-xs"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7" onClick={() => setMode("view")}>Back</Button>
              <AsyncActionButton
                label="Confirm Resolve"
                pendingLabel="Resolving..."
                pending={resolveMut.isPending}
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                onClick={() => resolveMut.mutate({ id: alert.id, resolution: resolutionNote.trim() })}
                className="h-7 border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"
              />
            </div>
          </div>
        ) : (
          <>
            {/* ── Message ─────────────────────────────────────── */}
            <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
              {alert.message || "No message body recorded for this alert."}
            </div>

            {/* ── Meta grid ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Source / Device</p>
                <p className="mt-0.5 truncate font-mono text-[11px]">{alert.device || alert.source || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rule</p>
                <p className="mt-0.5 truncate">{alert.ruleName || "Manual"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Assigned To</p>
                <p className="mt-0.5 truncate">{alert.assignedTo || alert.acknowledgedBy || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Created</p>
                <p className="mt-0.5">{formatTimestamp(alert.triggeredAt)} <span className="text-[10px] text-muted-foreground">({timeAgo(alert.triggeredAt)})</span></p>
              </div>
            </div>

            {/* ── Timeline ────────────────────────────────────── */}
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Timeline</p>
              <ol className="space-y-2.5">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-violet-500" aria-hidden />
                  <div className="min-w-0 text-xs">
                    <p className="font-medium">Created</p>
                    <p className="text-[10px] text-muted-foreground">{formatTimestamp(alert.triggeredAt)} — {timeAgo(alert.triggeredAt)}</p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className={`mt-1 flex h-2 w-2 shrink-0 rounded-full ${alert.acknowledgedAt || alert.acknowledgedBy ? "bg-sky-500" : "bg-muted-foreground/30"}`} aria-hidden />
                  <div className="min-w-0 text-xs">
                    <p className="font-medium">Acknowledged</p>
                    <p className="text-[10px] text-muted-foreground">
                      {alert.acknowledgedAt
                        ? `by ${alert.acknowledgedBy || "operator"} — ${formatTimestamp(alert.acknowledgedAt)} (${timeAgo(alert.acknowledgedAt)})`
                        : alert.acknowledgedBy
                          ? `by ${alert.acknowledgedBy} — timestamp not recorded`
                          : "Not acknowledged yet"}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className={`mt-1 flex h-2 w-2 shrink-0 rounded-full ${alert.resolvedAt ? "bg-emerald-500" : "bg-muted-foreground/30"}`} aria-hidden />
                  <div className="min-w-0 text-xs">
                    <p className="font-medium">Resolved</p>
                    <p className="text-[10px] text-muted-foreground">
                      {alert.resolvedAt ? `${formatTimestamp(alert.resolvedAt)} — ${timeAgo(alert.resolvedAt)}` : "Still open"}
                    </p>
                  </div>
                </li>
              </ol>
            </div>

            {/* ── Resolution callout ──────────────────────────── */}
            {alert.resolvedAt && alert.resolution ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Resolution
                </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{alert.resolution}</p>
              </div>
            ) : null}

            {/* ── Comments thread ─────────────────────────────── */}
            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageSquare className="h-3 w-3" aria-hidden /> Comments
                {comments.length > 0 && <Badge variant="secondary" className="text-[9px] tabular-nums">{comments.length}</Badge>}
              </p>
              {commentsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-4/5 rounded-lg" />
                </div>
              ) : comments.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-muted-foreground">No comments yet — start the investigation thread.</p>
              ) : (
                <ul className="mb-3 max-h-44 space-y-2.5 overflow-y-auto nice-scroll pr-1">
                  {comments.map((c) => (
                    <li key={c.id} className="flex items-start gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" aria-hidden>
                        {initialsOf(c.User?.name)}
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
                          <span className="font-semibold">{c.User?.name || "Unknown user"}</span>
                          <span className="text-muted-foreground" title={formatTimestamp(c.createdAt)}>{timeAgo(c.createdAt)}</span>
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed">{c.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2">
                <Textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  rows={2}
                  placeholder="Add an investigation note..."
                  aria-label="New comment"
                  className="text-xs"
                />
                <div className="flex justify-end">
                  <AsyncActionButton
                    label="Post Comment"
                    pendingLabel="Posting..."
                    pending={commentMut.isPending}
                    icon={<Send className="h-3.5 w-3.5" />}
                    disabled={!commentDraft.trim()}
                    onClick={() => commentMut.mutate({ alertId: alert.id, message: commentDraft.trim() })}
                    className="h-7"
                  />
                </div>
              </div>
            </div>

            {/* ── Action footer ───────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
              {status === "ACTIVE" && (
                <AsyncActionButton
                  label="Acknowledge"
                  pendingLabel="Acking..."
                  pending={acknowledgeMut.isPending}
                  icon={<CheckCheck className="h-3.5 w-3.5" />}
                  disabled={busy}
                  onClick={() => acknowledgeMut.mutate(alert.id)}
                  className="h-7"
                />
              )}
              {status !== "RESOLVED" && (
                <AsyncActionButton
                  label="Resolve"
                  pendingLabel="..."
                  pending={false}
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  disabled={busy}
                  onClick={() => setMode("resolve")}
                  className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                />
              )}
              {canAct && (
                <AsyncActionButton
                  label="Escalate"
                  pendingLabel="Escalating..."
                  pending={escalateMut.isPending}
                  icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                  disabled={busy}
                  onClick={() => escalateMut.mutate(alert.id)}
                  className="h-7 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Page component
// ═══════════════════════════════════════════════════════════════

export function AlertCenterPage() {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<RangeDays>(7);
  const [refreshMs, setRefreshMs] = useState(30000);
  const [feedSeverity, setFeedSeverity] = useState<string>("ALL");
  const [detailAlert, setDetailAlert] = useState<AlertDetailData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailResolveMode, setDetailResolveMode] = useState(false);

  const refetchInterval = refreshMs > 0 ? refreshMs : false;

  // ── Queries ───────────────────────────────────────────────────
  // Live payload: no status param on purpose — the route returns
  // ACTIVE + ACKNOWLEDGED (with suppressed rules filtered server-side),
  // which feeds BOTH the live feed and the escalation queue.
  const live = useQuery<AlertsPayload>({
    queryKey: ["alert-center-live"],
    queryFn: () => apiFetch<AlertsPayload>("/api/alerts"),
    refetchInterval,
  });

  const analytics = useQuery<Analytics>({
    queryKey: ["alert-center-analytics", days],
    queryFn: () => apiFetch<Analytics>(`/api/alerts/analytics?days=${days}`),
    refetchInterval,
  });

  // ── Row-level mutations (pending state tracked per alert id) ──
  const ackMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch("/api/alerts", { method: "POST", body: JSON.stringify({ action: "acknowledge", id }) }),
    onSuccess: () => {
      toast.success("Alert acknowledged");
      void queryClient.invalidateQueries({ queryKey: ["alert-center-live"] });
      void queryClient.invalidateQueries({ queryKey: ["alert-center-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message || "Acknowledge failed"),
  });

  const escalateMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ newSeverity?: string }>("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "escalate-alert", id }),
      }),
    onSuccess: (res) => {
      toast.success(`Escalated${res?.newSeverity ? ` — severity raised to ${res.newSeverity}` : ""}`);
      void queryClient.invalidateQueries({ queryKey: ["alert-center-live"] });
      void queryClient.invalidateQueries({ queryKey: ["alert-center-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message || "Escalation failed"),
  });

  // ── Derived data ──────────────────────────────────────────────
  const liveAlerts = useMemo(() => live.data?.alerts ?? [], [live.data]);

  const activeAlerts = useMemo(
    () => liveAlerts.filter((a) => normalizeStatus(a.status) === "ACTIVE"),
    [liveAlerts],
  );

  const severityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of activeAlerts) {
      const sev = normalizeSeverity(a.severity);
      counts.set(sev, (counts.get(sev) ?? 0) + 1);
    }
    return counts;
  }, [activeAlerts]);

  const sortedActive = useMemo(() => {
    return [...activeAlerts]
      .sort((a, b) => {
        const sevDiff =
          SEVERITY_ORDER.indexOf(normalizeSeverity(a.severity)) -
          SEVERITY_ORDER.indexOf(normalizeSeverity(b.severity));
        if (sevDiff !== 0) return sevDiff;
        return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
      })
      .filter((a) => feedSeverity === "ALL" || normalizeSeverity(a.severity) === feedSeverity);
  }, [activeAlerts, feedSeverity]);

  const feedRows = sortedActive.slice(0, FEED_PAGE_SIZE);

  // Escalation queue: escalated (level > 0) or acknowledged > 2h ago.
  const escalationQueue = useMemo(() => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    return liveAlerts
      .filter((a) => {
        const st = normalizeStatus(a.status);
        if (st !== "ACTIVE" && st !== "ACKNOWLEDGED") return false;
        if ((a.escalationLevel ?? 0) > 0) return true;
        if (st === "ACKNOWLEDGED" && a.acknowledgedAt && new Date(a.acknowledgedAt).getTime() < twoHoursAgo) return true;
        return false;
      })
      .sort((a, b) => {
        const lvl = (b.escalationLevel ?? 0) - (a.escalationLevel ?? 0);
        if (lvl !== 0) return lvl;
        return new Date(a.triggeredAt).getTime() - new Date(b.triggeredAt).getTime();
      });
  }, [liveAlerts]);

  const summary = analytics.data?.summary;
  const stats = live.data?.stats;

  const severities = useMemo(() => {
    const dist = analytics.data?.severityDistribution ?? [];
    const byKey = new Map<string, number>();
    for (const s of dist) {
      const key = normalizeSeverity(s.severity);
      byKey.set(key, (byKey.get(key) ?? 0) + s.count);
    }
    return SEVERITY_ORDER.map((sev) => ({ sev, count: byKey.get(sev) ?? 0 }));
  }, [analytics.data]);
  const maxSeverityCount = Math.max(1, ...severities.map((s) => s.count));
  const totalSeverityCount = severities.reduce((acc, s) => acc + s.count, 0);

  const trend = useMemo(() => analytics.data?.dailyTrend ?? [], [analytics.data]);
  const maxTrend = Math.max(1, ...trend.map(trendCount));
  const todayIso = new Date().toISOString().slice(0, 10);

  const topSources = (analytics.data?.topSources ?? []).slice(0, 5);
  const maxSourceCount = Math.max(1, ...topSources.map((s) => s.count));

  const resolveRate = summary?.resolveRate ?? 0;
  const resolveRateTone = resolveRate >= 90 ? "good" : resolveRate >= 70 ? "default" : "warn";

  function openDetail(a: AlertDetailData, resolveMode = false) {
    setDetailResolveMode(resolveMode);
    setDetailAlert(a);
    setDetailOpen(true);
  }

  function openDetailForLive(a: LiveAlert, resolveMode = false) {
    openDetail(toAlertDetailData(a), resolveMode);
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* ── Header row ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <BellRing className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
            Alert Center
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live operations feed, escalation queue and resolution performance for every alert the platform raises.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5" role="group" aria-label="Analytics time range">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={days === opt.days ? "default" : "ghost"}
                className="h-7 px-2.5 text-xs"
                aria-pressed={days === opt.days}
                onClick={() => setDays(opt.days)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <LivePulse label="LIVE" />
          <Select value={String(refreshMs)} onValueChange={(v) => setRefreshMs(Number(v))}>
            <SelectTrigger aria-label="Auto-refresh interval" className="h-8 w-[118px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={`Total Alerts (${days}d)`}
          value={String(summary?.totalAlerts ?? 0)}
          icon={<Layers className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />}
          iconChip="bg-violet-100 dark:bg-violet-950/40"
          hint={`${summary?.resolvedCount ?? 0} resolved in period`}
          loading={analytics.isLoading}
        />
        <StatCard
          label="Resolve Rate"
          value={`${resolveRate}%`}
          tone={resolveRateTone}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />}
          iconChip="bg-emerald-100 dark:bg-emerald-950/40"
          hint={`${summary?.resolvedCount ?? 0} of ${summary?.totalAlerts ?? 0} closed`}
          loading={analytics.isLoading}
        />
        <StatCard
          label="Avg Resolution"
          value={`${summary?.avgResolutionMin ?? 0} min`}
          tone="warn"
          icon={<Timer className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />}
          iconChip="bg-amber-100 dark:bg-amber-950/40"
          hint={`median ${summary?.medianResolutionMin ?? 0} min`}
          loading={analytics.isLoading}
        />
        <StatCard
          label="Active Now"
          value={String(stats?.active ?? 0)}
          tone={(stats?.active ?? 0) > 0 ? "bad" : "good"}
          icon={<Siren className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />}
          iconChip="bg-red-100 dark:bg-red-950/40"
          hint={`${stats?.acknowledged ?? 0} acknowledged pending`}
          loading={live.isLoading}
        />
      </div>

      {/* ── Main grid: feed (2 cols) + right rail ──────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Live Active Feed */}
        <SectionCard
          title="Live Active Feed"
          description="Unacknowledged alerts, critical first — hover a row for actions"
          icon={<Siren className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}
          iconChip="bg-red-100 dark:bg-red-950/40"
          countBadge={<Badge variant="secondary" className="text-[10px] tabular-nums">{activeAlerts.length}</Badge>}
          contentClassName="p-4 pt-0"
        >
          {/* Severity filter chips */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {(["ALL", ...SEVERITY_ORDER.filter((s) => s !== "INFO")] as string[]).map((sev) => {
              const count = sev === "ALL" ? activeAlerts.length : (severityCounts.get(sev) ?? 0);
              const active = feedSeverity === sev;
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setFeedSeverity(sev)}
                  aria-pressed={active}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold transition-colors ${
                    active
                      ? sev === "ALL"
                        ? "border-foreground bg-foreground text-background"
                        : `${SEVERITY_META[sev as keyof typeof SEVERITY_META].badge} ring-1 ring-current`
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {sev !== "ALL" && <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_META[sev as keyof typeof SEVERITY_META].dot}`} aria-hidden />}
                  {sev === "ALL" ? "All" : sev}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {live.isError ? (
            <ErrorStrip message={live.error instanceof Error ? live.error.message : "Live feed unavailable"} onRetry={() => void live.refetch()} />
          ) : live.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[62px] w-full rounded-lg" />)}
            </div>
          ) : feedRows.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All systems nominal"
              hint={feedSeverity === "ALL"
                ? "No unacknowledged alerts right now. New alerts appear here in real time."
                : `No ACTIVE ${feedSeverity} alerts. Switch the chip back to All to see other severities.`}
              action={<SeverityLegend />}
            />
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto nice-scroll pr-1">
              {feedRows.map((a) => {
                const ackPending = ackMut.isPending && ackMut.variables === a.id;
                return (
                  <div
                    key={a.id}
                    className="group relative flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={a.severity} />
                        <span className="truncate text-xs font-semibold">{a.title || a.type || "Untitled alert"}</span>
                        <SourceChip source={a.device} />
                        {(a.duplicateCount ?? 1) > 1 && (
                          <Badge variant="secondary" className="text-[9px] tabular-nums" title={`${a.duplicateCount} occurrences deduplicated`}>
                            x{a.duplicateCount}
                          </Badge>
                        )}
                        {(a.escalationLevel ?? 0) > 0 && (
                          <Badge variant="outline" className="border-red-300 bg-red-50 text-[9px] font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300" title={`Escalation level ${a.escalationLevel}`}>
                            <Zap className="mr-0.5 h-2.5 w-2.5" aria-hidden />x{a.escalationLevel}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{a.message}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                        <Clock3 className="h-2.5 w-2.5" aria-hidden />
                        {timeAgo(a.triggeredAt)}
                        {a.rule?.name ? <span className="truncate">— {a.rule.name}</span> : null}
                      </p>
                    </div>
                    {/* Hover actions */}
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <AsyncActionButton
                        label="Ack"
                        pendingLabel="..."
                        pending={ackPending}
                        icon={<CheckCheck className="h-3 w-3" />}
                        onClick={() => ackMut.mutate(a.id)}
                        className="h-7 px-2"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-emerald-300 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        aria-label={`Resolve alert ${a.title || a.id}`}
                        onClick={() => openDetailForLive(a, true)}
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        Resolve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        aria-label={`View details of alert ${a.title || a.id}`}
                        onClick={() => openDetailForLive(a)}
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                );
              })}
              {sortedActive.length > FEED_PAGE_SIZE && (
                <p className="pt-1 text-center text-[10px] text-muted-foreground">
                  Showing {FEED_PAGE_SIZE} of {sortedActive.length} active alerts — narrow by severity chip.
                </p>
              )}
            </div>
          )}
        </SectionCard>

        {/* Right rail */}
        <div className="space-y-4">
          {/* Escalation Queue */}
          <SectionCard
            title="Escalation Queue"
            description="Escalated, or acknowledged over 2 hours ago"
            icon={<Zap className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden />}
            iconChip="bg-orange-100 dark:bg-orange-950/40"
            countBadge={
              escalationQueue.length > 0 ? (
                <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] font-semibold tabular-nums text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {escalationQueue.length}
                </Badge>
              ) : undefined
            }
            contentClassName="p-4 pt-0"
          >
            {live.isError ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Queue unavailable — check connection.</p>
            ) : live.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : escalationQueue.length === 0 ? (
              <p className="flex items-center justify-center gap-1.5 py-6 text-xs text-muted-foreground">
                <ChevronUp className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                Queue clear — nothing is climbing the ladder.
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto nice-scroll pr-1">
                {escalationQueue.slice(0, 12).map((a) => {
                  const escPending = escalateMut.isPending && escalateMut.variables === a.id;
                  const staleAck = normalizeStatus(a.status) === "ACKNOWLEDGED" && (a.escalationLevel ?? 0) === 0;
                  return (
                    <div key={a.id} className="flex items-start gap-2 rounded-lg border p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold" title={a.title || a.type}>{a.title || a.type || "Untitled alert"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <EscalationLevelBadge level={a.escalationLevel ?? 0} />
                          <SeverityBadge severity={a.severity} size="xs" />
                          <span className="text-[10px] text-muted-foreground">
                            {staleAck ? `acked ${timeAgo(a.acknowledgedAt)}` : timeAgo(a.triggeredAt)}
                          </span>
                        </div>
                      </div>
                      <AsyncActionButton
                        label="Escalate"
                        pendingLabel="..."
                        pending={escPending}
                        icon={<ArrowUpRight className="h-3 w-3" />}
                        onClick={() => escalateMut.mutate(a.id)}
                        className="h-7 shrink-0 border-red-300 px-2 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Top Alert Sources */}
          <SectionCard
            title="Top Alert Sources"
            description={`Noisiest rules over the last ${days} days`}
            icon={<TrendingUp className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />}
            iconChip="bg-sky-100 dark:bg-sky-950/40"
            contentClassName="p-4 pt-0"
          >
            {analytics.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
              </div>
            ) : topSources.length === 0 ? (
              <p className="py-5 text-center text-xs text-muted-foreground">No alert sources recorded in this period.</p>
            ) : (
              <div className="space-y-2.5">
                {topSources.map((src) => (
                  <div key={src.ruleId ?? src.name}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-medium" title={src.name}>{src.name}</span>
                      <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{src.count} alerts</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-sky-400"
                        style={{ width: `${Math.max(3, (src.count / maxSourceCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Quick links */}
          <SectionCard
            title="Alert Modules"
            description="Jump to the other pages of this workspace"
            icon={<Activity className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />}
            iconChip="bg-violet-100 dark:bg-violet-950/40"
            contentClassName="p-4 pt-0"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {QUICK_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="group flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:border-violet-300 hover:bg-muted/40 dark:hover:border-violet-800"
                >
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${l.chip}`}>
                    <l.icon className={`h-3.5 w-3.5 ${l.iconColor}`} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-xs font-semibold">
                      {l.label}
                      <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">{l.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Analytics row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Severity distribution */}
        <SectionCard
          title="Severity Distribution"
          description={`All-time alert volume by severity (period: ${days}d trend)`}
          icon={<Layers className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />}
          iconChip="bg-violet-100 dark:bg-violet-950/40"
          contentClassName="p-4 pt-0"
        >
          {analytics.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full rounded-full" />)}
            </div>
          ) : totalSeverityCount === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No alerts recorded"
              hint="The distribution chart fills in as rules fire and manual alerts are created."
            />
          ) : (
            <>
              <div className="space-y-2.5">
                {severities.map(({ sev, count }) => (
                  <div key={sev} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-[10px] font-semibold tracking-wide">{sev}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${SEVERITY_META[sev].bar}`}
                        style={{ width: `${totalSeverityCount === 0 ? 0 : Math.max(2, (count / maxSeverityCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {count} · {totalSeverityCount === 0 ? 0 : Math.round((count / totalSeverityCount) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t pt-2.5">
                <SeverityLegend />
              </div>
            </>
          )}
        </SectionCard>

        {/* Daily trend */}
        <SectionCard
          title="Daily Trend"
          description={`Alerts created per day over the last ${days} days`}
          icon={<Activity className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}
          iconChip="bg-red-100 dark:bg-red-950/40"
          contentClassName="p-4 pt-0"
        >
          {analytics.isLoading ? (
            <Skeleton className="h-36 w-full rounded-lg" />
          ) : trend.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No trend data"
              hint={`Nothing was raised in the last ${days} days.`}
            />
          ) : (
            <div>
              <div className="flex h-36 items-end gap-1">
                {trend.map((point) => {
                  const count = trendCount(point);
                  const isToday = point.date === todayIso;
                  const heightPct = Math.max(3, (count / maxTrend) * 100);
                  return (
                    <div key={point.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${formatTrendDate(point.date)}: ${count} alert${count === 1 ? "" : "s"}`}>
                      {/* Hover tooltip */}
                      <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[9px] font-medium text-background group-hover:block">
                        {formatTrendDate(point.date)} · {count}
                      </span>
                      <div
                        className={`w-full rounded-t transition-colors ${
                          isToday
                            ? "bg-red-500 group-hover:bg-red-600"
                            : count === 0
                              ? "bg-muted group-hover:bg-muted-foreground/30"
                              : "bg-violet-400/80 group-hover:bg-violet-500"
                        }`}
                        style={{ height: `${count === 0 ? 2 : heightPct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground">
                <span>{formatTrendDate(trend[0]?.date ?? todayIso)}</span>
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden />alerts</span>
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />today</span>
                </span>
                <span>{formatTrendDate(trend[trend.length - 1]?.date ?? todayIso)}</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Background refresh indicator ───────────────────────── */}
      <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground">
        {(live.isFetching || analytics.isFetching) && !(live.isLoading || analytics.isLoading) ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Syncing with the alerts API...
          </>
        ) : refreshMs > 0 ? (
          <>
            Auto-refresh every {refreshMs / 1000}s — {stats?.today ?? 0} raised today in the live set
          </>
        ) : (
          "Auto-refresh paused"
        )}
      </p>

      {/* ── Shared detail dialog ───────────────────────────────── */}
      <AlertDetailDialog
        key={`${detailAlert?.id ?? "none"}-${detailResolveMode ? "resolve" : "view"}`}
        alert={detailAlert}
        open={detailOpen}
        onOpenChange={(o) => { setDetailOpen(o); if (!o) setDetailResolveMode(false); }}
        initialMode={detailResolveMode ? "resolve" : "view"}
      />
    </div>
  );
}

export default AlertCenterPage;
