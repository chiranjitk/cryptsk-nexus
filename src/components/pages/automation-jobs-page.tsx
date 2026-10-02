"use client";

// ─── Automation Jobs ─────────────────────────────────────────────
// Admin control surface for the 9 billing-cron jobs (port 3004):
// run-now, enable/disable (in-memory), countdowns and run history.
// All API calls go through the Caddy gateway via ?XTransformPort=3004
// (established pattern — direct :3000 access 404s client-side).
// ─────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ReceiptText,
  FileWarning,
  BellRing,
  ShieldAlert,
  LifeBuoy,
  TimerReset,
  Archive,
  Wifi,
  Play,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  History,
  PauseCircle,
  PlayCircle,
  Zap,
  ListChecks,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { apiFetch, cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────

interface JobExecution {
  id: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: "running" | "success" | "failed";
  result?: Record<string, unknown>;
  error?: string;
}

interface CronJob {
  id: string;
  name: string;
  description: string;
  type: string;
  cron: string;
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
  status: "idle" | "running";
  totalRuns: number;
  successCount: number;
  failCount: number;
  history: JobExecution[];
}

interface JobsResponse {
  jobs: CronJob[];
  total: number;
  summary: {
    total: number;
    enabled: number;
    running: number;
    totalExecutions: number;
  };
}

interface RunResponse {
  success: boolean;
  message: string;
  jobId: string;
  status: string;
  triggeredBy?: string;
  job?: {
    id: string;
    name: string;
    status: string;
    lastRun?: string | null;
    nextRun: string;
    totalRuns: number;
    successCount: number;
    failCount: number;
    history: JobExecution[];
  };
}

type CardStatus = "idle" | "running" | "success" | "failed";

// ─── Constants ───────────────────────────────────────────────────

const JOBS_KEY = ["automation-jobs"] as const;

// Per-job identity for the 9 known ids — icon + color-coded chip.
// Names/descriptions always come from the API; this map only styles.
const JOB_META: Record<string, { icon: LucideIcon; chip: string }> = {
  "job-001": { icon: ReceiptText, chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" },
  "job-002": { icon: FileWarning, chip: "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400" },
  "job-003": { icon: BellRing, chip: "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400" },
  "job-004": { icon: ShieldAlert, chip: "bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400" },
  "job-005": { icon: Wifi, chip: "bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400" },
  "job-006": { icon: CalendarClock, chip: "bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400" },
  "job-007": { icon: LifeBuoy, chip: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400" },
  "job-008": { icon: TimerReset, chip: "bg-teal-100 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400" },
  "job-009": { icon: Archive, chip: "bg-lime-100 text-lime-700 dark:bg-lime-950/50 dark:text-lime-400" },
};

const JOB_META_FALLBACK = {
  icon: CalendarClock,
  chip: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
};

const STATUS_BADGE: Record<CardStatus, { label: string; className: string }> = {
  idle: {
    label: "Idle",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  running: {
    label: "Running",
    className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  },
  success: {
    label: "Success",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────

// Humanize the cron expressions used by the registry (minute hour dom month dow).
function describeCron(expr: string): string {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return expr;
  const [min, hour, dom, , dow] = f;
  if (min === "*" && hour === "*") return "Every hour";
  if (!/^\d+$/.test(hour) || !/^\d+$/.test(min)) return expr;
  const hhmm = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  if (dom === "*" && dow === "*") return `Daily at ${hhmm}`;
  if (dom === "*" && /^\d+$/.test(dow)) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const d = Number(dow) % 7;
    return `Weekly on ${days[d]} at ${hhmm}`;
  }
  if (/^\d+$/.test(dom) && dow === "*") {
    const d = Number(dom);
    if (d >= 1 && d <= 31) {
      const suffix =
        d === 1 || d === 21 || d === 31 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
      return `Monthly on the ${d}${suffix} at ${hhmm}`;
    }
  }
  return expr;
}

// Relative countdown until nextRun ("2h 13m", "due now" when overdue).
function formatCountdown(nextRun: string, now: number): string {
  const diff = new Date(nextRun).getTime() - now;
  if (!Number.isFinite(diff)) return "—";
  if (diff <= 0) return "due now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "<1 min";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Relative time for past timestamps ("just now", "5m ago", "3h ago", "2d ago").
function formatAgo(ts: string, now: number): string {
  const diff = now - new Date(ts).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// 840 → "840ms", 1200 → "1.2s", 125000 → "2m 05s"
function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// "archivedAuditLogs" → "archived audit logs"
function prettifyKey(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

// Compact "key: value" chips (≤3) from a run-result object; nested
// objects/arrays (e.g. retention windows, details[]) are skipped.
function formatLastResult(result?: Record<string, unknown>): string[] {
  if (!result) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(result)) {
    if (out.length >= 3) break;
    if (v == null || typeof v === "object") continue;
    const value = typeof v === "number" ? v.toLocaleString("en-IN") : String(v);
    out.push(`${prettifyKey(k)}: ${value}`);
  }
  return out;
}

function cardStatus(job: CronJob): CardStatus {
  if (job.status === "running") return "running";
  const last = job.history?.[0];
  if (last && last.status !== "running") return last.status === "success" ? "success" : "failed";
  return "idle";
}

// Jobs that SUSPEND subscribers get a two-step confirm before Run now.
function needsConfirm(job: CronJob): boolean {
  return /suspend|expir/i.test(`${job.type} ${job.description}`);
}

// ─── Small building blocks ───────────────────────────────────────

function SummaryChip({ icon: Icon, label, value, dotClass }: {
  icon: LucideIcon;
  label: string;
  value: string;
  dotClass?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{label}</span>
      <span className="text-foreground font-semibold">{value}</span>
      {dotClass && <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden="true" />}
    </span>
  );
}

function StatusDot({ status }: { status: CardStatus }) {
  if (status === "running") {
    return <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />;
  }
  if (status === "success") return <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />;
  if (status === "failed") return <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />;
  return <span className="h-2 w-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />;
}

// ─── Job card ────────────────────────────────────────────────────

function JobCard({ job, now }: { job: CronJob; now: number }) {
  const queryClient = useQueryClient();
  const meta = JOB_META[job.id] ?? JOB_META_FALLBACK;
  const Icon = meta.icon;
  const status = cardStatus(job);
  const badge = STATUS_BADGE[status];
  const lastEntry = job.history?.[0];
  const resultChips = useMemo(() => formatLastResult(lastEntry?.result), [lastEntry]);
  const countdown = formatCountdown(job.nextRun, now);
  const overdue = countdown === "due now";
  const confirmRequired = needsConfirm(job);

  // Two-step confirm state (suspend/expire jobs)
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  // History panel state
  const [historyOpen, setHistoryOpen] = useState(false);

  const runMutation = useMutation({
    mutationFn: (id: string) => apiFetch<RunResponse>(`/api/jobs/${id}/run?XTransformPort=3004`, { method: "POST" }),
    onSuccess: (res) => {
      toast.success(res.message || `Job "${job.name}" started`);
      // Server-side execution is async — poll a few times so the card
      // flips running → success/failed with fresh result + nextRun.
      [1500, 5000, 10000].forEach((d) =>
        setTimeout(() => queryClient.invalidateQueries({ queryKey: JOBS_KEY }), d)
      );
    },
    onError: (err: Error) => {
      if (err.message.includes("409")) {
        toast.warning(`"${job.name}" is already running`);
      } else if (err.message.includes("400")) {
        toast.warning(`"${job.name}" is disabled — enable it to run manually`);
      } else if (err.message.includes("401") || err.message.includes("403")) {
        toast.error("Session expired or insufficient role — please re-login as admin");
      } else {
        toast.error(`Failed to trigger "${job.name}": ${err.message}`);
      }
    },
  });

  // Enable/disable — optimistic flip with rollback on failure. Nothing is
  // persisted server-side (in-memory flag in billing-cron), reverts on restart.
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch<{ success: boolean; job: { id: string; enabled: boolean } }>(
        `/api/jobs/${job.id}?XTransformPort=3004`,
        { method: "PATCH", body: JSON.stringify({ enabled }) }
      ),
    onMutate: async (enabled: boolean) => {
      await queryClient.cancelQueries({ queryKey: JOBS_KEY });
      const prev = queryClient.getQueryData<JobsResponse>(JOBS_KEY);
      if (prev) {
        queryClient.setQueryData<JobsResponse>(JOBS_KEY, {
          ...prev,
          jobs: prev.jobs.map((j) => (j.id === job.id ? { ...j, enabled } : j)),
          summary: {
            ...prev.summary,
            enabled: Math.max(0, Math.min(prev.summary.total, prev.summary.enabled + (enabled ? 1 : -1))),
          },
        });
      }
      return { prev };
    },
    onSuccess: (_res, enabled) => {
      toast.success(`${job.name} ${enabled ? "enabled" : "disabled"}`);
    },
    onError: (err: Error, _enabled, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(JOBS_KEY, ctx.prev);
      if (err.message.includes("404")) toast.error("Job not found — was the service restarted?");
      else if (err.message.includes("401") || err.message.includes("403")) toast.error("Session expired — please re-login as admin");
      else toast.error(`Failed to update "${job.name}": ${err.message}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: JOBS_KEY }),
  });

  const running = status === "running";
  const history = (job.history ?? []).slice(0, 5);

  const handleRunClick = () => {
    if (confirmRequired && !confirming) {
      setConfirming(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setConfirming(false);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    runMutation.mutate(job.id);
  };

  return (
    <Card className={cn("flex flex-col transition-shadow hover:shadow-md", !job.enabled && "opacity-80")}>
      <CardContent className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        {/* Top row: identity + status */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              meta.chip
            )}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground" title={job.name}>
                {job.id} · {job.name}
              </h3>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={job.description}>
              {job.description}
            </p>
          </div>
          <Badge variant="outline" className={cn("shrink-0 gap-1.5 font-medium", badge.className)}>
            <StatusDot status={status} />
            {badge.label}
            <span className="sr-only">— last status of {job.name}</span>
          </Badge>
        </div>

        {/* Schedule row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <code className="rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            {job.cron}
          </code>
          <span className="text-muted-foreground">{describeCron(job.cron)}</span>
          <span className="text-muted-foreground/50" aria-hidden="true">·</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              overdue ? "text-amber-600 dark:text-amber-400" : "text-foreground"
            )}
            title={`Next run: ${new Date(job.nextRun).toLocaleString("en-IN")}${job.enabled ? "" : " (paused while disabled)"}`}
          >
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Next run in {countdown}
          </span>
          {!job.enabled && (
            <Badge variant="outline" className="border-transparent bg-muted text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Disabled
            </Badge>
          )}
        </div>

        {/* Stats row: 3 mini tiles */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2 min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">Total runs</p>
            <p className="truncate text-sm font-semibold text-foreground">{job.totalRuns.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2 min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">Success rate</p>
            {(() => {
              const rate = job.totalRuns === 0 ? null : Math.round((job.successCount / job.totalRuns) * 100);
              return (
                <p
                  className={cn(
                    "truncate text-sm font-semibold",
                    rate == null
                      ? "text-foreground"
                      : rate >= 90
                        ? "text-emerald-600 dark:text-emerald-400"
                        : rate >= 70
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                  )}
                  title={`${job.successCount} succeeded · ${job.failCount} failed`}
                >
                  {rate == null ? "—" : `${rate}%`}
                </p>
              );
            })()}
          </div>
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2 min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">Last result</p>
            {resultChips.length > 0 ? (
              <p className="truncate text-xs font-medium text-foreground" title={resultChips.join(" · ")}>
                {resultChips[0]}
                {resultChips.length > 1 && <span className="text-muted-foreground"> +{resultChips.length - 1}</span>}
              </p>
            ) : (
              <p className="truncate text-xs text-muted-foreground">{running ? "running…" : "no runs yet"}</p>
            )}
          </div>
        </div>
        {resultChips.length > 1 && (
          <p className="-mt-2 truncate text-[11px] text-muted-foreground">{resultChips.slice(1).join(" · ")}</p>
        )}

        {/* Expandable history */}
        {historyOpen && (
          <div className="rounded-lg border bg-muted/20">
            <p className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recent runs
            </p>
            {history.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>No runs yet — runs on schedule or via Run now</span>
              </div>
            ) : (
              <ul className="max-h-48 overflow-y-auto nice-scroll divide-y divide-border/60">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2.5 px-3 py-2">
                    {entry.status === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                    ) : entry.status === "failed" ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden="true" />
                    ) : (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-amber-500 motion-reduce:animate-none" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
                        <span
                          className="font-medium text-foreground"
                          title={new Date(entry.startedAt).toLocaleString("en-IN")}
                        >
                          {formatAgo(entry.startedAt, now)}
                        </span>
                        <span className="text-muted-foreground/50" aria-hidden="true">·</span>
                        <span className="text-muted-foreground">{formatDuration(entry.durationMs)}</span>
                        {formatLastResult(entry.result).length > 0 && (
                          <>
                            <span className="text-muted-foreground/50" aria-hidden="true">·</span>
                            <span className="truncate text-muted-foreground" title={formatLastResult(entry.result).join(" · ")}>
                              {formatLastResult(entry.result).join(" · ")}
                            </span>
                          </>
                        )}
                      </p>
                      {entry.error && (
                        <p className="mt-0.5 truncate text-xs text-red-600 dark:text-red-400" title={entry.error}>
                          {entry.error}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Footer row: actions */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-2">
            <Button
              size="default"
              className={cn(
                "h-11 gap-2 px-4",
                confirming && "bg-destructive text-white hover:bg-destructive/90"
              )}
              onClick={handleRunClick}
              disabled={running || !job.enabled || toggleMutation.isPending}
              title={
                running
                  ? "Job is running"
                  : !job.enabled
                    ? "Enable the job first"
                    : confirmRequired
                      ? "Two-step confirm — this job can suspend subscribers"
                      : `Run ${job.name} now`
              }
              aria-label={
                confirming
                  ? `Confirm run of ${job.name}`
                  : `Run ${job.name} now`
              }
              aria-description={confirmRequired ? "This job can suspend subscribers — confirmation required" : undefined}
            >
              {runMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : confirming ? (
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              {runMutation.isPending ? "Starting…" : confirming ? "Confirm run?" : "Run now"}
            </Button>
            {confirmRequired && !confirming && (
              <span className="hidden text-[11px] text-muted-foreground lg:inline">affects subscribers</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="p-1.5" title={job.enabled ? "Job is enabled — scheduled runs active" : "Job is disabled — scheduler skips it (in-memory, reverts on restart)"}>
              <Switch
                size="sm"
                checked={job.enabled}
                disabled={toggleMutation.isPending}
                onCheckedChange={(v: boolean) => toggleMutation.mutate(v)}
                aria-label={`${job.enabled ? "Disable" : "Enable"} ${job.name}`}
              />
            </span>
            <span
              className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground"
              aria-hidden="true"
            >
              {job.enabled ? (
                <PlayCircle className="h-4 w-4 text-emerald-500" />
              ) : (
                <PauseCircle className="h-4 w-4" />
              )}
              <span className="hidden md:inline">{job.enabled ? "Enabled" : "Disabled"}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-11 p-0"
              onClick={() => setHistoryOpen((o) => !o)}
              aria-expanded={historyOpen}
              aria-controls={`${job.id}-history`}
              aria-label={`${historyOpen ? "Hide" : "Show"} run history for ${job.name}`}
            >
              {historyOpen ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
        {historyOpen && <span id={`${job.id}-history`} className="sr-only">Run history for {job.name}</span>}
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────

export default function AutomationJobsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<JobsResponse>({
    queryKey: JOBS_KEY,
    queryFn: () => apiFetch<JobsResponse>("/api/jobs?XTransformPort=3004"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Lightweight 30s ticker — re-renders countdowns/relative times without refetching.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const summary = data?.summary;
  const jobs = data?.jobs ?? [];
  const totals = useMemo(() => {
    const runs = jobs.reduce((s, j) => s + j.totalRuns, 0);
    const ok = jobs.reduce((s, j) => s + j.successCount, 0);
    const rate = runs > 0 ? Math.round((ok / runs) * 100) : null;
    return { runs, ok, rate };
  }, [jobs]);

  const rateDot = totals.rate == null ? "bg-muted-foreground/40" : totals.rate >= 90 ? "bg-emerald-500" : totals.rate >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="animate-page-enter space-y-6 p-4 sm:p-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md"
            aria-hidden="true"
          >
            <CalendarClock className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Automation Jobs</h1>
            <p className="text-sm text-muted-foreground">
              Billing, SLA, expiry and retention automation — powered by billing-cron
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {summary ? (
            <>
              <SummaryChip icon={PlayCircle} label="Enabled" value={`${summary.enabled}/${summary.total}`} />
              <SummaryChip icon={ListChecks} label="Total runs" value={totals.runs.toLocaleString("en-IN")} />
              <SummaryChip
                icon={Target}
                label="Success rate"
                value={totals.rate == null ? "—" : `${totals.rate}%`}
                dotClass={rateDot}
              />
            </>
          ) : (
            <>
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </>
          )}
          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh automation jobs"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-busy="true">
          <span className="sr-only">Loading automation jobs…</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-5 w-3/4" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-14 rounded-lg" />
                  <Skeleton className="h-14 rounded-lg" />
                  <Skeleton className="h-14 rounded-lg" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-11 w-28 rounded-md" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50" aria-hidden="true">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Could not load automation jobs</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "The billing-cron service may be unreachable."}
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} className="h-11 gap-2" aria-label="Retry loading automation jobs">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted" aria-hidden="true">
              <Zap className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground">No jobs registered</p>
            <p className="text-sm text-muted-foreground">
              The billing-cron service on port 3004 reported no scheduled jobs.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} now={now} />
          ))}
        </div>
      )}

      {/* Footer hint — sandbox clock is UTC and getNextRun() uses server-local Date ops,
          so the displayed schedules/next-run times are UTC-accurate. */}
      <p className="text-center text-xs text-muted-foreground">
        Jobs run inside the billing-cron service on port 3004 · schedules are UTC · enable/disable is in-memory and reverts on service restart
      </p>
    </div>
  );
}
