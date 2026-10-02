// Server-side XLSX export (Phase 2, Task 3-a) — uses the long-idle `xlsx` (SheetJS) dep.
// Returns a ready-to-send NextResponse with proper spreadsheet MIME headers.
// Doctrine mirrors lib/export-utils.csvResponse: caller does requireAuth + auditExport,
// this helper only builds the workbook + response.

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export function xlsxResponse(
  headers: string[],
  rows: (string | number)[][],
  filename: string
): NextResponse {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // Column widths: clamp header-derived width to 12..42 chars (readable, not bloated).
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, Math.min(42, h.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
