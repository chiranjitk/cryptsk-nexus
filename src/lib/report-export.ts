// ─── Unified Client-Side Report Export Helpers ────────────────────
// Single source of truth for report downloads (CSV / JSON / print-PDF).
// Replaces the ~25 copy-pasted blob builders across report pages.
// CSV escaping + BOM + filename conventions come from the shared
// isomorphic export-utils; print-to-PDF uses a styled popup window
// (zero extra dependencies — OOM-safe per platform memory doctrine).

import { buildCsvString, generateExportFilename } from "@/lib/export-utils";

export interface ReportColumn<T = Record<string, unknown>> {
  header: string;
  /** Row property to render (may be a nested path like "subscriber.name"). */
  key: string;
  /** Optional formatter (e.g. fmtINR / fmtDate) — applied to the raw value. */
  format?: (value: unknown, row: T) => string | number;
}

function pickValue<T extends Record<string, unknown>>(
  row: T,
  col: ReportColumn<T>,
): string | number {
  const parts = col.key.split(".");
  let raw: unknown = row;
  for (const p of parts) raw = (raw as Record<string, unknown> | null)?.[p];
  if (col.format) return col.format(raw, row);
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "object") return JSON.stringify(raw);
  return raw as string | number;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Download rows as a BOM-safe CSV (Excel-friendly). */
export function downloadCsv<T extends Record<string, unknown>>(
  baseName: string,
  columns: ReportColumn<T>[],
  rows: T[],
): void {
  const headers = columns.map((c) => c.header);
  const data = rows.map((r) => columns.map((c) => pickValue(r, c)));
  const csv = buildCsvString(headers, data);
  triggerDownload(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    generateExportFilename(baseName, "csv"),
  );
}

/** Download any payload as pretty-printed JSON. */
export function downloadJson(baseName: string, data: unknown): void {
  triggerDownload(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    generateExportFilename(baseName, "json"),
  );
}

export interface PrintReportOptions<T extends Record<string, unknown>> {
  title: string;
  subtitle?: string;
  /** Key-value lines shown under the title (period, filters, generated-at…). */
  meta?: { label: string; value: string }[];
  columns: ReportColumn<T>[];
  rows: T[];
  /** Summary footer lines (Total billed, Total outstanding…). */
  totals?: { label: string; value: string }[];
  baseName?: string;
  orientation?: "portrait" | "landscape";
  company?: string;
}

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const inrFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
/** Format a number as INR (₹) for print/CSV display. */
export function fmtINRDisplay(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return `₹${inrFmt.format(n)}`;
}

/**
 * Open a styled print window for the report → user saves as PDF.
 * Self-contained HTML (inline <style>) — independent of the frozen globals.css.
 */
export function printReport<T extends Record<string, unknown>>(
  opts: PrintReportOptions<T>,
): void {
  const {
    title,
    subtitle,
    meta = [],
    columns,
    rows,
    totals = [],
    orientation = "portrait",
    company = "Cryptsk Networks Pvt Ltd",
  } = opts;

  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const metaHtml = meta.length
    ? `<div class="meta">${meta
        .map((m) => `<span><b>${escapeHtml(m.label)}:</b> ${escapeHtml(m.value)}</span>`)
        .join("")}</div>`
    : "";
  const thead = `<tr>${columns
    .map((c) => `<th>${escapeHtml(c.header)}</th>`)
    .join("")}</tr>`;
  const body = rows.length
    ? rows
        .map(
          (r) =>
            `<tr>${columns
              .map((c) => {
                const v = pickValue(r, c);
                return `<td>${escapeHtml(
                  typeof v === "number" ? inrFmt.format(v) : v,
                )}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${columns.length}" class="empty">No data for the selected filters</td></tr>`;
  const totalsHtml = totals.length
    ? `<div class="totals">${totals
        .map(
          (t) =>
            `<div class="total-row"><span>${escapeHtml(t.label)}</span><b>${escapeHtml(t.value)}</b></div>`,
        )
        .join("")}</div>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; font-size: 11px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #dc2626; padding-bottom: 8px; margin-bottom: 10px; }
  .brand { font-size: 17px; font-weight: 800; color: #dc2626; letter-spacing: 0.5px; }
  .brand-sub { font-size: 9px; color: #666; letter-spacing: 1.5px; text-transform: uppercase; }
  h1 { font-size: 15px; margin: 2px 0; }
  .subtitle { font-size: 10px; color: #555; }
  .stamp { text-align: right; font-size: 9px; color: #555; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 9.5px; background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 4px; padding: 6px 10px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a2e; color: #fff; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; padding: 6px 7px; text-align: left; }
  td { padding: 5px 7px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #fafafa; }
  td.empty { text-align: center; color: #999; padding: 24px; }
  .totals { margin-top: 10px; margin-left: auto; width: 260px; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; }
  .total-row { display: flex; justify-content: space-between; padding: 5px 10px; font-size: 10.5px; border-bottom: 1px solid #f0f0f0; }
  .total-row:last-child { background: #fef2f2; font-size: 11.5px; }
  .foot { margin-top: 18px; display: flex; justify-content: space-between; font-size: 8.5px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="head">
  <div><div class="brand">${escapeHtml(company.toUpperCase())}</div><div class="brand-sub">Intelligent ISP Platform</div></div>
  <div style="text-align:right"><h1>${escapeHtml(title)}</h1>${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}<div class="stamp">Generated: ${escapeHtml(generatedAt)} (IST)<br/>Records: ${rows.length}</div></div>
</div>
${metaHtml}
<table><thead>${thead}</thead><tbody>${body}</tbody></table>
${totalsHtml}
<div class="foot"><span>${escapeHtml(company)} — Confidential internal report</span><span>Page 1</span></div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;

  const win = window.open("", "_blank", "width=980,height=720");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ─── Server-Rendered Format Downloads (CSV / XLSX / PDF) ──────────
// Reports Phase 3: report APIs serve authoritative files (?format=…)
// with audit trail + server-side pagination/PDF rendering. The client
// just streams the blob and derives the filename from Content-Disposition.

export interface ServerFormatOptions {
  /** Report API base path, e.g. "/api/reports/collection-register". */
  basePath: string;
  /** Current filter state — re-sent so the file matches what's on screen. */
  params?: Record<string, string>;
  /** Requested file format. */
  format: "csv" | "xlsx" | "pdf";
  /** Filename stem used when the server sends no Content-Disposition. */
  baseName: string;
}

/**
 * Download a server-rendered report file (CSV / XLSX / PDF).
 * Throws with the API's `error` message on non-2xx responses.
 */
export async function downloadServerFormat(opts: ServerFormatOptions): Promise<void> {
  const qs = new URLSearchParams({ ...(opts.params || {}), format: opts.format });
  const res = await fetch(`${opts.basePath}?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch {
      // binary/empty body on error — keep the generic message
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="([^"]+)"/);
  const filename =
    m?.[1] || `${opts.baseName}_${new Date().toISOString().slice(0, 10)}.${opts.format}`;
  triggerDownload(blob, filename);
}
