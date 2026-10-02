"use client";

// ─── Policy engine shared kit (POL-ENGINE-1) ──────────────────────
// Common shell + hooks for the five 24online-parity policy pages.
// Single-page layout: create/edit form on top, manage table below.

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, X, ShieldCheck, Users } from "lucide-react";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface PolicyRow {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  planCount?: number;
}

export function usePolicyList<T extends PolicyRow>(endpoint: string, queryKey: string) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => apiFetch<{ policies: T[] }>(endpoint),
  });
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: [queryKey] }), [qc, queryKey]);
  return { policies: data?.policies || [], isLoading, invalidate };
}

export async function savePolicy(endpoint: string, method: "POST" | "PATCH", body: unknown, id?: string) {
  return apiFetch(id ? `${endpoint}/${id}` : endpoint, { method, body: JSON.stringify(body) });
}

export function useDeletePolicy(endpoint: string, invalidate: () => void, label: string) {
  const [busy, setBusy] = useState<string | null>(null);
  const del = useCallback(
    async (row: PolicyRow) => {
      if (!confirm(`Delete policy "${row.name}"? This cannot be undone.`)) return;
      setBusy(row.id);
      try {
        await deletePolicy(endpoint, row.id);
        toast.success(`${label} deleted`);
        invalidate();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Delete failed";
        toast.error(msg);
      } finally {
        setBusy(null);
      }
    },
    [endpoint, invalidate, label]
  );
  return { del, busy };
}

// ─── Shell: title + stats + create/edit card + table ──────────────

export function PolicyPageShell({
  title, subtitle, icon, stats, form, table,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  stats: { label: string; value: string | number }[];
  form: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            {icon}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-card px-3 py-1.5 text-center min-w-[86px]">
              <div className="text-base font-bold leading-tight">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      {form}
      {table}
    </div>
  );
}

export function PolicyFormCard({
  editing, onClose, children, title,
}: {
  editing: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          {editing ? <Pencil className="h-4 w-4 text-amber-500" /> : <Plus className="h-4 w-4 text-emerald-500" />}
          {editing ? `Editing: ${title}` : "Create New Policy"}
        </CardTitle>
        {editing && (
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 gap-1 text-xs">
            <X className="h-3.5 w-3.5" /> Cancel edit
          </Button>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function PolicyTable({
  headers, children, isLoading,
}: {
  headers: string[];
  children: React.ReactNode;
  isLoading: boolean;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Manage Policies
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[480px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                {headers.map((h) => (
                  <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                ))}
                <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (
                        <TableCell key={h}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                : children}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
        No policies yet — create your first one with the form above.
      </TableCell>
    </TableRow>
  );
}

export function PlanCountBadge({ count }: { count?: number }) {
  if (!count) return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" />0 plans</span>;
  return (
    <Badge variant="outline" className="gap-1 text-[11px] bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
      <Users className="h-3 w-3" />{count} plan{count > 1 ? "s" : ""}
    </Badge>
  );
}

export function EnabledSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label="Toggle policy enabled" />;
}

// ─── Small labelled field helpers ─────────────────────────────────

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function RadioRow<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-3 py-2 text-left transition-all ${
            value === o.value
              ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40"
              : "border-border hover:border-emerald-500/30 hover:bg-muted/40"
          }`}
        >
          <div className="text-sm font-medium">{o.label}</div>
          {o.hint && <div className="text-[11px] text-muted-foreground">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}

export function useLocalForm<T>(initial: T, editingKey: string | null) {
  const [form, setForm] = useState<T>(initial);
  useEffect(() => {
    if (editingKey === null) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingKey]);
  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => setForm((f) => ({ ...f, [k]: v })), []);
  return { form, set, setForm };
}
