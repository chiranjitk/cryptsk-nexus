"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Copy, Check, AlertCircle, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// CRYPTSK Nexus — VoucherPrintDialog (Billing › Vouchers › Print)
// Staff handout sheet: up to 200 voucher codes for the CURRENT
// table filter (the table itself only loads 100), rendered as a
// printable grid. Printing is driven by the @media print rules in
// globals.css — everything except .print-area is hidden on paper.
// ============================================================

type VoucherPrintStatus = "unused" | "used" | "expired" | "cancelled";

type VoucherPrintVoucher = {
  id: string; code: string; faceValue: number; currency: string;
  status: VoucherPrintStatus; batchNumber: string | null; expiresAt: string | null;
};

const STATUS_BADGES: Record<VoucherPrintStatus, string> = {
  unused: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600",
  used: "border-muted bg-muted/30 text-muted-foreground",
  expired: "border-amber-500/30 bg-amber-500/5 text-amber-600",
  cancelled: "border-red-500/30 bg-red-500/5 text-red-600",
};

const BATCH_RE = /^VCH-/i;

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export function VoucherPrintDialog({ search, status, onClose }: { search: string; status: string; onClose: () => void }) {
  const { toast } = useToast();
  const [copiedAll, setCopiedAll] = React.useState(false);

  // Same-origin fetch (credentials ride along like every other call in
  // this app) — up to 200 codes for the current filter, well above the
  // 100 the table keeps in memory.
  const url = `/api/vouchers?limit=200${status ? `&status=${encodeURIComponent(status)}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["vouchers-print", search, status],
    queryFn: async () => {
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load vouchers");
      return body as { vouchers: VoucherPrintVoucher[] };
    },
  });

  const vouchers: VoucherPrintVoucher[] = data?.vouchers || [];
  const hasNonUnused = vouchers.some((v) => v.status !== "unused");
  const unusedCodes = vouchers.filter((v) => v.status === "unused").map((v) => v.code);

  // Batch line — a /^VCH-/i search IS a batch number (same rule the
  // Export CSV button uses); anything else is a substring filter.
  const batchLabel = BATCH_RE.test(search.trim()) ? search.trim() : "Current selection";
  const distinctFaces = [...new Set(vouchers.map((v) => v.faceValue))];
  const faceLabel =
    distinctFaces.length === 0
      ? "—"
      : distinctFaces.length === 1
        ? `₹${distinctFaces[0]}`
        : `₹${Math.min(...distinctFaces)}–₹${Math.max(...distinctFaces)}`;
  const expiryStamps = vouchers.map((v) => (v.expiresAt ? new Date(v.expiresAt).getTime() : 0)).filter((t) => t > 0);
  const maxExpiry = expiryStamps.length > 0 ? new Date(Math.max(...expiryStamps)) : null;

  async function handleCopyAll() {
    if (unusedCodes.length === 0) return;
    const ok = await copyToClipboard(unusedCodes.join("\n"));
    if (ok) {
      setCopiedAll(true);
      toast({ title: `Copied ${unusedCodes.length} codes` });
      window.setTimeout(() => setCopiedAll(false), 2500);
    } else {
      toast({ title: "Copy failed", description: "Select the codes on the sheet and copy them manually.", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-4 sm:max-w-2xl cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Print voucher handout sheet</DialogTitle>
          <DialogDescription>
            Up to 200 codes for the current filter — the sheet below is what goes on paper.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10" aria-busy="true">
            <div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
            <p className="text-xs text-muted-foreground">Preparing handout sheet…</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-1.5 py-8" role="alert">
            <AlertCircle className="size-8 text-amber-500" />
            <p className="text-sm font-medium">Failed to load vouchers</p>
            <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "The request failed. Try again."}</p>
            <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : vouchers.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8">
            <p className="text-sm font-medium">No vouchers match the current filter</p>
            <p className="text-xs text-muted-foreground">Adjust the search or status filter on the table, then try Print again.</p>
          </div>
        ) : (
          <div
            id="voucher-print-area"
            className="print-area max-h-[70vh] overflow-y-auto cryptsk-scrollbar rounded-md border bg-card p-4 cryptsk-fade-in"
          >
            {/* Sheet header */}
            <div className="border-b pb-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Cryptsk Private Limited
              </p>
              <h2 className="text-lg font-bold tracking-tight">Prepaid Recharge Vouchers</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Batch: {batchLabel} · Face value: {faceLabel} each · Valid until: {maxExpiry ? fmtDay(maxExpiry) : "—"} · Issued: {fmtDay(new Date())}
              </p>
              {hasNonUnused && (
                <p className="text-xs font-medium text-amber-600">
                  Tip: filter status = Unused to print a clean handout sheet.
                </p>
              )}
            </div>

            {/* Code cards — 2 columns on screen, dashed cut lines */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {vouchers.map((v) => (
                <div key={v.id} className="print-no-repeat-break rounded-md border border-dashed p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-lg font-semibold tracking-wider">{v.code}</p>
                    <Badge variant="outline" className={`shrink-0 text-[10px] capitalize ${STATUS_BADGES[v.status] || ""}`}>
                      {v.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Face value: ₹{v.faceValue} · {v.expiresAt ? `Valid until ${fmtDay(new Date(v.expiresAt))}` : "No expiry"}
                  </p>
                </div>
              ))}
            </div>

            {/* Sheet footer */}
            <div className="mt-4 border-t pt-2 text-center text-[10px] text-muted-foreground">
              <p>Redeem in the Self-Care portal → Payments → Redeem voucher · Support: support@cryptsk.com</p>
              <p>Generated {new Date().toLocaleString("en-IN")} · {vouchers.length} codes</p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-row items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 disabled:pointer-events-auto disabled:cursor-not-allowed"
            onClick={handleCopyAll}
            disabled={unusedCodes.length === 0}
            title={unusedCodes.length === 0 ? "No unused codes in this selection" : "Copy every unused code, one per line"}
          >
            {copiedAll ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            Copy all unused{unusedCodes.length > 0 ? ` (${unusedCodes.length})` : ""}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => window.print()}
              disabled={isLoading || isError || vouchers.length === 0}
            >
              <Printer className="size-3.5" /> Print
            </Button>
            <Button variant="ghost" size="sm" className="h-9" onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
