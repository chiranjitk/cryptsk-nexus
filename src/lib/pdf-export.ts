// Server-side PDF export (Reports Phase 3, RPT-P3-A) — jsPDF + jspdf-autotable.
// Mirrors lib/xlsx-export.ts doctrine: caller does requireAuth + auditExport,
// this helper only builds the document + response.
//
// Notes:
//  - jsPDF's built-in Helvetica font has NO ₹ glyph — every cell string is
//    sanitized ("₹" → "Rs. ", control chars stripped) before rendering.
//  - A4 landscape when the table has more than 6 columns, portrait otherwise.
//  - Table head repeats on every page (autoTable default); a title block and a
//    "page X/Y" footer are drawn on top of the table grid.

import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfExportOptions {
  /** Bold title line on page 1 (e.g. human report name). */
  title?: string;
  /** Secondary line under the title (e.g. filter context). */
  subtitle?: string;
  /** Extra key/value-ish meta lines under the subtitle. */
  meta?: string[];
}

/**
 * Sanitize a cell for jsPDF core-font rendering:
 * null/undefined → "", "₹" → "Rs. " (Helvetica has no rupee glyph),
 * control characters stripped, everything else stringified.
 */
function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  return str.replace(/₹/g, "Rs. ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function pdfResponse(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  opts?: PdfExportOptions
): NextResponse {
  // A4 landscape for wide tables (>6 columns), portrait otherwise.
  const orientation = headers.length > 6 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Title block (page 1) ────────────────────────────────────────
  let cursorY = 14;
  if (opts?.title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(sanitizeCell(opts.title), 14, cursorY);
    cursorY += 7;
  }
  if (opts?.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(sanitizeCell(opts.subtitle), 14, cursorY, { maxWidth: pageWidth - 28 });
    cursorY += 5.5;
  }
  if (opts?.meta?.length) {
    doc.setFontSize(8);
    for (const line of opts.meta) {
      doc.text(sanitizeCell(line), 14, cursorY, { maxWidth: pageWidth - 28 });
      cursorY += 4.5;
    }
  }
  // "Generated ..." line always present
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated ${new Date().toISOString()} — Cryptsk Nexus`, 14, cursorY);
  cursorY += 4;
  doc.setTextColor(0, 0, 0);

  // ── Table ───────────────────────────────────────────────────────
  autoTable(doc, {
    head: [headers.map((h) => sanitizeCell(h))],
    body: rows.map((row) => row.map((cell) => sanitizeCell(cell))),
    startY: cursorY,
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      overflow: "linebreak",
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    margin: { top: 10, bottom: 12, left: 14, right: 14 },
  });

  // ── Footer: "page X/Y" on every page ("after" approach) ─────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Page ${i}/${pageCount}`,
      pageWidth - 14,
      pageHeight - 6,
      { align: "right" }
    );
    doc.setTextColor(0, 0, 0);
  }

  const buf = Buffer.from(doc.output("arraybuffer"));
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
    },
  });
}
