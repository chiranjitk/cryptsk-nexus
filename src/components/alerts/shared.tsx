"use client";

// ═══════════════════════════════════════════════════════════════
// Alert Management shared kit — production design language for all
// 6 ALERT MANAGEMENT pages. Client-safe, zero server imports.
// ═══════════════════════════════════════════════════════════════
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bell, Clock3 } from "lucide-react";

// Re-use the integrations platform primitives so both modules share
// one visual language (stat strips, async buttons, switches).
export { MiniStat, AsyncActionButton, EnabledSwitch, WarningStrip, DocsLink } from "@/components/integrations/shared";

// ─── Severity normalization ─────────────────────────────────────
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export function normalizeSeverity(raw?: string | null): Severity {
  const v = (raw ?? "").toUpperCase();
  if (v === "CRITICAL" || v === "HIGH" || v === "MEDIUM" || v === "LOW" || v === "INFO") return v;
  if (v === "WARN" || v === "WARNING") return "MEDIUM";
  if (v === "ERROR" || v === "FATAL") return "CRITICAL";
  return "MEDIUM";
}

export const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export const SEVERITY_META: Record<Severity, { badge: string; dot: string; bar: string; text: string }> = {
  CRITICAL: { badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", bar: "bg-red-500", text: "text-red-600" },
  HIGH: { badge: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500", bar: "bg-orange-500", text: "text-orange-600" },
  MEDIUM: { badge: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-400", bar: "bg-amber-400", text: "text-amber-600" },
  LOW: { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-400", bar: "bg-emerald-400", text: "text-emerald-600" },
  INFO: { badge: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-400", bar: "bg-sky-400", text: "text-sky-600" },
};

export function SeverityBadge({ severity, size = "sm" }: { severity?: string | null; size?: "xs" | "sm" }) {
  const sev = normalizeSeverity(severity);
  return (
    <Badge variant="outline" className={`${SEVERITY_META[sev].badge} ${size === "xs" ? "text-[9px] px-1.5 py-0" : "text-[10px]"} font-semibold`}>
      {sev}
    </Badge>
  );
}

// ─── Status ─────────────────────────────────────────────────────
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "SUPPRESSED";

export function normalizeStatus(raw?: string | null): AlertStatus {
  const v = (raw ?? "").toUpperCase().replace(" ", "_");
  if (v === "ACKNOWLEDGED" || v === "RESOLVED" || v === "SUPPRESSED") return v;
  return "ACTIVE";
}

export const STATUS_META: Record<AlertStatus, { badge: string; label: string }> = {
  ACTIVE: { badge: "bg-red-100 text-red-700 border-red-200", label: "Active" },
  ACKNOWLEDGED: { badge: "bg-blue-50 text-sky-700 border-sky-200", label: "Acknowledged" },
  RESOLVED: { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Resolved" },
  SUPPRESSED: { badge: "bg-violet-100 text-violet-700 border-violet-200", label: "Suppressed" },
};

export function StatusBadge({ status }: { status?: string | null }) {
  const st = normalizeStatus(status);
  return <Badge variant="outline" className={`${STATUS_META[st].badge} text-[10px] font-semibold`}>{STATUS_META[st].label}</Badge>;
}

// ─── Notification channels ──────────────────────────────────────
export const CHANNEL_META: Record<string, { badge: string; label: string }> = {
  IN_APP: { badge: "bg-slate-100 text-slate-700 border-slate-200", label: "In-App" },
  EMAIL: { badge: "bg-sky-100 text-sky-700 border-sky-200", label: "Email" },
  SMS: { badge: "bg-orange-100 text-orange-700 border-orange-200", label: "SMS" },
  WHATSAPP: { badge: "bg-green-100 text-green-700 border-green-200", label: "WhatsApp" },
  PUSH: { badge: "bg-amber-100 text-amber-700 border-amber-200", label: "Push" },
  WEBHOOK: { badge: "bg-violet-100 text-violet-700 border-violet-200", label: "Webhook" },
};

export function ChannelBadge({ channel, size = "sm" }: { channel: string; size?: "xs" | "sm" }) {
  const meta = CHANNEL_META[String(channel).toUpperCase()] ?? { badge: "bg-gray-100 text-gray-600 border-gray-200", label: String(channel) };
  return <Badge variant="outline" className={`${meta.badge} ${size === "xs" ? "text-[9px] px-1.5 py-0" : "text-[10px]"} font-medium`}>{meta.label}</Badge>;
}

export function ChannelBadgeList({ channels, max = 4 }: { channels: string[] | string | null | undefined; max?: number }) {
  const list = (() => {
    if (!channels) return [] as string[];
    if (Array.isArray(channels)) return channels.filter(Boolean);
    // handle "IN_APP,EMAIL" or JSON-string '["IN_APP","EMAIL"]'
    try {
      const parsed = JSON.parse(channels);
      if (Array.isArray(parsed)) return (parsed as string[]).filter(Boolean);
    } catch { /* not JSON */ }
    return String(channels).split(",").map((c) => c.trim()).filter(Boolean);
  })();
  if (list.length === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const shown = list.slice(0, max);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((c) => <ChannelBadge key={c} channel={c} size="xs" />)}
      {list.length > max && <span className="text-[9px] text-muted-foreground">+{list.length - max}</span>}
    </div>
  );
}

// ─── Time helpers ───────────────────────────────────────────────
export function formatTimestamp(ts?: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(ts?: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff) || diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ago`;
}

export function durationBetween(start?: string | null, end?: string | null): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  if (isNaN(s) || isNaN(e)) return "—";
  const mins = Math.max(0, Math.floor((e - s) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

// ─── Empty state ────────────────────────────────────────────────
export function EmptyState({ icon: Icon = Bell, title, hint, action }: {
  icon?: React.ElementType;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// ─── Live "breathing" indicator for real-time feeds ─────────────
export function LivePulse({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2 py-0.5">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
      </span>
      <span className="text-[9px] font-bold tracking-wider text-red-600">{label}</span>
    </span>
  );
}

// ─── Countdown chip for suppression windows ─────────────────────
export function CountdownChip({ endsAt }: { endsAt?: string | null }) {
  if (!endsAt) return <Badge variant="secondary" className="text-[10px]">manual — until lifted</Badge>;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return <Badge variant="outline" className="text-[10px]">expired</Badge>;
  const mins = Math.floor(ms / 60000);
  const label = mins < 60 ? `${mins}m left` : `${Math.floor(mins / 60)}h ${mins % 60}m left`;
  const urgent = mins < 30;
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${urgent ? "border-amber-300 text-amber-700 bg-amber-50" : "text-muted-foreground"}`}>
      <Clock3 className="mr-1 h-2.5 w-2.5" />{label}
    </Badge>
  );
}

// ─── Severity legend (shared across pages) ──────────────────────
export function SeverityLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" />CRITICAL — immediate action</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" />HIGH — same day</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />MEDIUM — monitor</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />LOW — informational</span>
    </div>
  );
}
