/**
 * Cryptsk — Data Export Utilities
 * Shared helpers for CSV/Excel export generation and response formatting.
 */

/**
 * Escape a value for safe CSV embedding.
 * Wraps in quotes and escapes internal quotes.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Convert an array of header strings + an array of row arrays into a CSV string.
 * Handles BOM for Excel UTF-8 compatibility.
 */
export function buildCsvString(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) =>
    row.map((v) => escapeCsvValue(v)).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

/**
 * Generate a dated filename: e.g. "subscribers_export_2025-07-15.csv"
 */
export function generateExportFilename(prefix: string, extension = "csv"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_export_${date}.${extension}`;
}

/**
 * Build standard CSV download response headers.
 * Includes BOM for Excel UTF-8 compatibility.
 */
export function csvResponseHeaders(filename: string): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
  };
}

/**
 * Create a CSV NextResponse with proper headers and BOM.
 */
export function csvResponse(
  headers: string[],
  rows: unknown[][],
  filename: string
): Response {
  const csvContent = buildCsvString(headers, rows);
  const bom = "\uFEFF";
  const buffer = Buffer.from(bom + csvContent, "utf-8");
  return new Response(buffer, {
    headers: csvResponseHeaders(filename),
  });
}

/**
 * Format a Date (or null) for display in Indian locale.
 */
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN");
}

/**
 * Format a DateTime for display in Indian locale.
 */
export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN");
}

/**
 * Format a number as INR currency.
 */
export function fmtINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
