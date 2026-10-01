"use client";

// ─── Shared INTEGRATIONS UI kit ───────────────────────────────
// One visual language across Payment Gateways / SMS / Email /
// WhatsApp & Push / Webhooks / Integration Logs.

import React, { useState } from "react";
import {
  Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Loader2, ExternalLink, Eye, EyeOff,
  Zap, Clock3, AlertTriangle,
} from "lucide-react";
import type { ProviderField, ProviderMeta, AdapterTestResult } from "@/lib/integrations/client-types";

// ─── Provider logo chip ───────────────────────────────────────
export function ProviderChip({ provider, size = "md" }: { provider: Pick<ProviderMeta, "badge" | "color" | "name">; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";
  return (
    <div
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-lg font-bold tracking-tight", provider.color, sz)}
      title={provider.name}
    >
      {provider.badge}
    </div>
  );
}

// ─── Environment / status pills ───────────────────────────────
export function EnvironmentPill({ environment }: { environment: string }) {
  const isLive = environment === "live" || environment === "prod" || environment === "production";
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5",
      isLive ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
        : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300")}>
      {isLive ? "LIVE" : "TEST"}
    </Badge>
  );
}

export function EnabledPill({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5",
      enabled ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400")}>
      {enabled ? "Active" : "Inactive"}
    </Badge>
  );
}

// ─── Adapter test result banner ───────────────────────────────
export function TestResultBanner({ result, className }: { result: AdapterTestResult | null; className?: string }) {
  if (!result) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm",
        result.ok
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-red-200 bg-red-50/70 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200",
        className,
      )}
    >
      {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{result.message}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-80">
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {result.latencyMs} ms</span>
          <span>{new Date(result.testedAt ?? Date.now()).toLocaleTimeString()}</span>
        </p>
        {result.details && Object.keys(result.details).length > 0 && (
          <pre className="mt-2 max-h-28 overflow-auto rounded bg-black/5 p-2 text-[11px] leading-relaxed dark:bg-white/5">
            {JSON.stringify(result.details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Secret input with reveal toggle ──────────────────────────
export function SecretInput({
  id, value, onChange, placeholder, autoComplete = "off",
}: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide value" : "Show value"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── Dynamic config form driven by ProviderField[] ────────────
export function DynamicConfigFields({
  fields, values, onChange, disabled,
}: {
  fields: ProviderField[];
  values: Record<string, string>;
  onChange: (key: string, value: string, field: ProviderField) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const id = `field-${f.key}`;
        const val = values[f.key] ?? "";
        return (
          <div key={f.key} className={cn("space-y-1.5", f.type === "textarea" && "sm:col-span-2")}>
            <Label htmlFor={id} className="text-xs">
              {f.label} {f.required && <span className="text-red-500">*</span>}
            </Label>
            {f.type === "select" ? (
              <Select
                value={val || f.defaultValue || ""}
                onValueChange={(v) => onChange(f.key, v, f)}
                disabled={disabled}
              >
                <SelectTrigger id={id} className="h-9"><SelectValue placeholder={`Select ${f.label.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>
                  {(f.options ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : f.type === "textarea" ? (
              <Textarea
                id={id}
                value={val}
                rows={4}
                disabled={disabled}
                onChange={(e) => onChange(f.key, e.target.value, f)}
                placeholder={f.placeholder}
                className="font-mono text-xs"
              />
            ) : f.type === "password" ? (
              <SecretInput id={id} value={val} onChange={(v) => onChange(f.key, v, f)} placeholder={f.placeholder} />
            ) : (
              <Input
                id={id}
                type={f.type === "number" ? "number" : "text"}
                value={val}
                disabled={disabled}
                onChange={(e) => onChange(f.key, e.target.value, f)}
                placeholder={f.placeholder ?? f.defaultValue}
              />
            )}
            {f.helpText && <p className="text-[11px] text-muted-foreground">{f.helpText}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Validation: required fields present ──────────────────────
export function validateProviderFields(fields: ProviderField[], values: Record<string, string>): string | null {
  for (const f of fields) {
    if (f.required && !String(values[f.key] ?? "").trim()) {
      return `${f.label} is required`;
    }
  }
  return null;
}

// ─── Docs link button ─────────────────────────────────────────
export function DocsLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      API Docs <ExternalLink className="h-3 w-3" />
    </a>
  );
}

// ─── Test/Send button with pending state ──────────────────────
export function AsyncActionButton({
  label, pendingLabel, pending, icon, onClick, variant = "outline", disabled, className,
}: {
  label: string; pendingLabel: string; pending: boolean;
  icon?: React.ReactNode; onClick: () => void;
  variant?: "outline" | "default" | "secondary"; disabled?: boolean; className?: string;
}) {
  return (
    <Button type="button" variant={variant} size="sm" onClick={onClick} disabled={pending || disabled} className={cn("gap-1.5", className)}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon ?? <Zap className="h-3.5 w-3.5" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

// ─── Latency + status mini-stat ───────────────────────────────
export function MiniStat({ label, value, tone = "default", icon }: {
  label: string; value: string; tone?: "default" | "good" | "bad" | "warn"; icon?: React.ReactNode;
}) {
  const tones = {
    default: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-red-600 dark:text-red-400",
    warn: "text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </span>
      <span className={cn("text-sm font-semibold", tones[tone])}>{value}</span>
    </div>
  );
}

// ─── Warning strip (e.g. masked credentials notice) ──────────
export function WarningStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ─── Enabled switch (row-level) ───────────────────────────────
export function EnabledSwitch({ checked, onChange, disabled, ariaLabel }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; ariaLabel: string;
}) {
  return <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={ariaLabel} />;
}
