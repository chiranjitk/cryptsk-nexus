"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_TEMPLATE_HTML, MERGE_FIELD_GROUPS } from "@/lib/invoice-merge";

interface TemplateDto {
  id: string;
  name: string;
  type: string;
  isSystem: boolean;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
}

interface DefaultsState {
  defaultUserInvoiceTemplateId: string;
  defaultPartnerInvoiceTemplateId: string;
  defaultCustomInvoiceTemplateId: string;
}

const TYPE_STYLES: Record<string, string> = {
  USER: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  PARTNER: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  CUSTOM: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
};

const TYPE_KEYS: Record<string, keyof DefaultsState> = {
  USER: "defaultUserInvoiceTemplateId",
  PARTNER: "defaultPartnerInvoiceTemplateId",
  CUSTOM: "defaultCustomInvoiceTemplateId",
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const EMPTY_DRAFT = {
  id: null as string | null,
  name: "",
  type: "USER",
  bodyHtml: DEFAULT_TEMPLATE_HTML,
};

async function api<T>(url: string, init?: RequestInit): Promise<T & { ok: boolean; error?: string }> {
  const res = await fetch(url, init);
  return res.json();
}

export default function InvoiceTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [defaults, setDefaults] = useState<DefaultsState>({
    defaultUserInvoiceTemplateId: "",
    defaultPartnerInvoiceTemplateId: "",
    defaultCustomInvoiceTemplateId: "",
  });
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        api<{ data: TemplateDto[] }>("/api/invoice-templates"),
        api<{ data: DefaultsState }>("/api/settings/invoice-template-config"),
      ]);
      if (tRes.ok) setTemplates(tRes.data);
      else setMsg({ kind: "error", text: tRes.error ?? "Failed to load templates" });
      if (cRes.ok)
        setDefaults({
          defaultUserInvoiceTemplateId: cRes.data.defaultUserInvoiceTemplateId ?? "",
          defaultPartnerInvoiceTemplateId: cRes.data.defaultPartnerInvoiceTemplateId ?? "",
          defaultCustomInvoiceTemplateId: cRes.data.defaultCustomInvoiceTemplateId ?? "",
        });
    } catch {
      setMsg({ kind: "error", text: "Failed to load templates" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Debounced live preview
  useEffect(() => {
    if (!draft.bodyHtml.trim()) {
      setPreviewHtml("<p style='font-family:sans-serif;color:#94a3b8;'>Empty template body.</p>");
      return;
    }
    const id = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await api<{ data: { html: string } }>("/api/invoice-templates/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bodyHtml: draft.bodyHtml }),
        });
        setPreviewHtml(res.ok ? res.data.html : `<pre>${res.error ?? "Preview failed"}</pre>`);
      } catch {
        setPreviewHtml("<pre>Preview failed</pre>");
      } finally {
        setPreviewing(false);
      }
    }, 700);
    return () => clearTimeout(id);
  }, [draft.bodyHtml]);

  function selectTemplate(t: TemplateDto) {
    setDraft({ id: t.id, name: t.name, type: t.type, bodyHtml: t.bodyHtml });
    setSelectedId(t.id);
    setDirty(false);
    setMsg(null);
  }

  function newTemplate() {
    setDraft({ ...EMPTY_DRAFT, bodyHtml: DEFAULT_TEMPLATE_HTML });
    setSelectedId(null);
    setDirty(false);
    setMsg(null);
  }

  function insertToken(token: string) {
    const el = areaRef.current;
    const current = draft.bodyHtml;
    const at = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? at;
    const tokenText = "{" + token + "}";
    setDraft((d) => ({ ...d, bodyHtml: current.slice(0, at) + tokenText + current.slice(end) }));
    setDirty(true);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        const pos = at + tokenText.length;
        el.setSelectionRange(pos, pos);
      }
    });
  }

  async function save() {
    if (!draft.name.trim()) {
      setMsg({ kind: "error", text: "Template name is required" });
      return;
    }
    setSaving(true);
    try {
      const payload = { name: draft.name.trim(), type: draft.type, bodyHtml: draft.bodyHtml };
      const res = draft.id
        ? await api<{ data: TemplateDto }>("/api/invoice-templates", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: draft.id, ...payload }),
          })
        : await api<{ data: TemplateDto }>("/api/invoice-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error(res.error ?? "Save failed");
      setMsg({ kind: "ok", text: draft.id ? "Template updated" : "Template created" });
      if (!draft.id && res.data?.id) {
        setDraft((d) => ({ ...d, id: res.data.id }));
        setSelectedId(res.data.id);
      }
      await loadAll();
      setDirty(false);
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    try {
      const res = await api<{ data: TemplateDto }>("/api/invoice-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: (draft.name.trim() || "Untitled") + " (copy)",
          type: draft.type,
          bodyHtml: draft.bodyHtml,
        }),
      });
      if (!res.ok) throw new Error(res.error ?? "Duplicate failed");
      setMsg({ kind: "ok", text: "Template duplicated" });
      await loadAll();
      if (res.data?.id) selectTemplate(res.data);
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Duplicate failed" });
    }
  }

  async function removeTemplates(ids: string[]) {
    if (!ids.length) return;
    const protectedNames = templates.filter((t) => ids.includes(t.id) && t.isSystem).map((t) => t.name);
    const deletable = templates.filter((t) => ids.includes(t.id) && !t.isSystem).map((t) => t.id);
    if (!deletable.length) {
      setMsg({ kind: "error", text: "System templates cannot be deleted" });
      return;
    }
    if (!window.confirm(`Delete ${deletable.length} template(s)? This cannot be undone.`)) return;
    try {
      const res = await api<{ data: { deleted: number } }>(
        `/api/invoice-templates?ids=${deletable.join(",")}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(res.error ?? "Delete failed");
      setMsg({
        kind: "ok",
        text: `Deleted ${res.data.deleted} template(s)` + (protectedNames.length ? " — system templates are protected" : ""),
      });
      setSelectedIds(new Set());
      if (draft.id && ids.includes(draft.id)) newTemplate();
      await loadAll();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Delete failed" });
    }
  }

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const res = await api("/api/settings/invoice-template-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaults),
      });
      if (!res.ok) throw new Error(res.error ?? "Failed to save defaults");
      setMsg({ kind: "ok", text: "Default templates updated" });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed to save defaults" });
    } finally {
      setSavingConfig(false);
    }
  }

  const isDefaultOf = (t: TemplateDto) => defaults[TYPE_KEYS[t.type] ?? "defaultUserInvoiceTemplateId"] === t.id;
  const current = templates.find((t) => t.id === draft.id);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoice Templates</h1>
          <p className="text-sm text-muted-foreground">
            Design printable invoice templates with merge fields and bind a default per billing type (User / Partner / Custom).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={newTemplate}>
            New template
          </Button>
          <Button onClick={save} disabled={saving || !draft.name.trim()}>
            {saving ? "Saving…" : draft.id ? "Save changes" : "Create template"}
          </Button>
        </div>
      </header>

      {msg && (
        <div
          role="status"
          className={
            "rounded-md border px-3 py-2 text-sm " +
            (msg.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400")
          }
        >
          {msg.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Template list ── */}
        <section aria-label="Templates" className="flex flex-col gap-3">
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-medium">Templates ({templates.length})</span>
              {loading && <span className="text-xs text-muted-foreground">loading…</span>}
            </div>
            <div className="max-h-[440px] overflow-y-auto p-2 [scrollbar-width:thin]">
              {loading && !templates.length && (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              )}
              {!loading && !templates.length && (
                <p className="p-4 text-sm text-muted-foreground">No templates yet — create your first one.</p>
              )}
              <div className="flex flex-col gap-1.5">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className={
                      "group flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors " +
                      (selectedId === t.id ? "border-primary bg-accent" : "border-transparent hover:bg-accent/50")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelect(t.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${t.name}`}
                      className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                    />
                    <button type="button" onClick={() => selectTemplate(t)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{t.name}</span>
                        <span
                          className={
                            "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold " +
                            (TYPE_STYLES[t.type] ?? TYPE_STYLES.CUSTOM)
                          }
                        >
                          {t.type}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {t.isSystem && <span className="rounded bg-muted px-1 font-medium">System</span>}
                        {isDefaultOf(t) && <span className="font-medium text-emerald-600 dark:text-emerald-400">★ Default</span>}
                        <span>Updated {new Date(t.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => removeTemplates(Array.from(selectedIds))}>
              Delete selected ({selectedIds.size})
            </Button>
          )}
        </section>

        {/* ── Editor + preview ── */}
        <section className="flex min-w-0 flex-col gap-4">
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-end md:justify-between">
              <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-name">Template name</Label>
                  <Input
                    id="tpl-name"
                    value={draft.name}
                    placeholder="e.g. Premium Fiber Invoice"
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, name: e.target.value }));
                      setDirty(true);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-type">Type</Label>
                  <select
                    id="tpl-type"
                    value={draft.type}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, type: e.target.value }));
                      setDirty(true);
                    }}
                    className={SELECT_CLASS}
                    disabled={Boolean(current?.isSystem)}
                  >
                    <option value="USER">User invoices</option>
                    <option value="PARTNER">Partner billing</option>
                    <option value="CUSTOM">Custom invoices</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={duplicate} disabled={!draft.bodyHtml.trim()}>
                  Duplicate
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => draft.id && removeTemplates([draft.id])}
                  disabled={!draft.id || Boolean(current?.isSystem)}
                  title={current?.isSystem ? "System templates cannot be deleted" : "Delete template"}
                >
                  Delete
                </Button>
              </div>
            </div>

            <div className="space-y-3 px-4 py-3">
              <div className="space-y-1.5">
                <Label>Merge fields — click to insert at cursor</Label>
                <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-2 [scrollbar-width:thin]">
                  <div className="flex flex-col gap-2">
                    {MERGE_FIELD_GROUPS.map((g) => (
                      <div key={g.group} className="flex flex-wrap items-center gap-1">
                        <span className="mr-1 w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {g.group}
                        </span>
                        {g.fields.map((f) => (
                          <button
                            key={f.token}
                            type="button"
                            title={f.label}
                            onClick={() => insertToken(f.token)}
                            className="rounded border bg-background px-1.5 py-0.5 text-[11px] transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            {`{${f.token}}`}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tpl-body">Template body (HTML)</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {dirty ? "unsaved changes" : "saved"} · {draft.bodyHtml.length.toLocaleString()} chars
                  </span>
                </div>
                <Textarea
                  id="tpl-body"
                  ref={areaRef}
                  value={draft.bodyHtml}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, bodyHtml: e.target.value }));
                    setDirty(true);
                  }}
                  className="h-72 resize-y font-mono text-xs"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-medium">Live preview — sample data</span>
              <span className="text-xs text-muted-foreground">{previewing ? "rendering…" : "rendered"}</span>
            </div>
            <div className="p-3">
              <iframe
                title="Template preview"
                srcDoc={previewHtml}
                sandbox=""
                className="h-[480px] w-full rounded-md border bg-white"
              />
            </div>
          </div>
        </section>
      </div>

      {/* ── Default bindings ── */}
      <section className="rounded-xl border bg-card text-card-foreground shadow" aria-label="Default template bindings">
        <div className="border-b px-4 py-3">
          <span className="text-sm font-medium">Default template per invoice type</span>
          <p className="text-xs text-muted-foreground">
            The bound template is used automatically when invoices of that type are rendered or printed.
          </p>
        </div>
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
          {(["USER", "PARTNER", "CUSTOM"] as const).map((type) => (
            <div key={type} className="space-y-1.5">
              <Label htmlFor={`def-${type}`}>
                {type === "USER" ? "User invoices" : type === "PARTNER" ? "Partner billing" : "Custom invoices"}
              </Label>
              <select
                id={`def-${type}`}
                value={defaults[TYPE_KEYS[type]]}
                onChange={(e) => setDefaults((d) => ({ ...d, [TYPE_KEYS[type]]: e.target.value }))}
                className={SELECT_CLASS}
              >
                <option value="">— none —</option>
                {templates
                  .filter((t) => t.type === type)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t px-4 py-3">
          <Button size="sm" onClick={saveConfig} disabled={savingConfig}>
            {savingConfig ? "Saving…" : "Save defaults"}
          </Button>
        </div>
      </section>
    </div>
  );
}
