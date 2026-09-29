"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ticket, Plus, Search, Printer, History, Filter, Trash2, Pencil,
  LayoutTemplate, CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, Loader2, Copy, Eye, Download, X,
  User, Phone, Calendar, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";
import { escapeHtml } from "@/lib/utils/html-escape";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

// ─── Types ─────────────────────────────────────────────────
interface VoucherItem {
  id: string; code: string; denomination: number; validityDays: number;
  status: string; usedBySubscriberId: string | null; usedAt: string | null;
  generatedById: string | null; createdAt: string; updatedAt: string;
  plan: { id: string; name: string } | null;
  usedBySubscriber: { id: string; name: string; code: string } | null;
}

interface TemplateItem {
  id: string; name: string; denomination: number; description: string;
  validityDays: number; isActive: boolean; createdAt: string;
}

interface VoucherStats {
  total: number; active: number; used: number; expired: number; cancelled: number;
}

interface UsageHistoryItem {
  id: string; code: string; denomination: number; validityDays: number;
  status: string; usedAt: string | null; createdAt: string;
  plan: { id: string; name: string } | null;
  usedBySubscriber: { id: string; name: string; code: string; phone: string } | null;
}

interface VoucherDetail extends VoucherItem {
  usageHistory: Array<{
    id: string; amount: number; paymentMode: string; status: string;
    createdAt: string; invoice?: { invoiceNumber: string } | null;
  }>;
}

// ─── Helpers ───────────────────────────────────────────────
function getExpiryInfo(createdAt: string, validityDays: number) {
  const now = new Date();
  const created = new Date(createdAt);
  const expiresAt = new Date(created.getTime() + validityDays * 86400000);
  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000);
  const isExpired = daysUntilExpiry <= 0;
  const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  return { expiresAt, daysUntilExpiry, isExpired, isExpiringSoon, formattedExpiry: expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) };
}

function ExpiryBadge({ createdAt, validityDays }: { createdAt: string; validityDays: number }) {
  const { isExpired, isExpiringSoon, daysUntilExpiry, formattedExpiry } = getExpiryInfo(createdAt, validityDays);
  if (isExpired) return <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200">Expired</Badge>;
  if (isExpiringSoon) return <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">{daysUntilExpiry}d left</Badge>;
  return <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">{formattedExpiry}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Active", cls: "bg-green-100 text-green-700 border-green-200" },
    USED: { label: "Used", cls: "bg-teal-100 text-teal-700 border-teal-200" },
    EXPIRED: { label: "Expired", cls: "bg-red-100 text-red-700 border-red-200" },
    CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const s = map[status] || { label: status, cls: "" };
  return <Badge variant="outline" className={`text-[10px] ${s.cls}`}>{s.label}</Badge>;
}

// ─── Print Vouchers ────────────────────────────────────────
function printVoucherCards(vouchers: VoucherItem[]) {
  const printWin = window.open("", "_blank", "width=800,height=600");
  if (!printWin) { toast.error("Please allow popups to print vouchers"); return; }
  const expiry = (v: VoucherItem) => {
    const d = new Date(new Date(v.createdAt).getTime() + v.validityDays * 86400000);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };
  printWin.document.write(`<!DOCTYPE html><html><head><title>Print Vouchers</title><style>
    body{font-family:system-ui,sans-serif;margin:20px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .card{border:2px dashed #ccc;border-radius:8px;padding:16px;text-align:center;page-break-inside:avoid}
    .code{font-family:monospace;font-size:18px;font-weight:bold;margin:8px 0;letter-spacing:1px}
    .amount{font-size:24px;font-weight:bold;color:#DC2626}
    .label{font-size:11px;color:#666;text-transform:uppercase;margin-top:8px}
    .plan{font-size:12px;color:#333;margin-top:4px}
    .expiry{font-size:10px;color:#999}
    .scratch{font-size:9px;color:#aaa;margin-top:12px;border-top:1px solid #eee;padding-top:4px}
    @media print{body{margin:0}.no-print{display:none}}
  </style></head><body>
    <div class="no-print" style="margin-bottom:20px"><button onclick="window.print()" style="padding:8px 24px;background:#DC2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print Vouchers</button></div>
    <h2 style="text-align:center;margin-bottom:4px">ISP Voucher Cards</h2>
    <p style="text-align:center;color:#666;font-size:11px;margin-bottom:16px">Total: ${vouchers.length} voucher(s) &mdash; Printed: ${new Date().toLocaleDateString("en-IN")}</p>
    <div class="grid">${vouchers.map((v) => `<div class="card">
      <div class="label">ISP Voucher</div>
      <div class="amount">${formatINR(v.denomination)}</div>
      <div class="code">${escapeHtml(v.code)}</div>
      ${v.plan ? `<div class="plan">${escapeHtml(v.plan.name)}</div>` : ""}
      <div class="expiry">Valid: ${v.validityDays} days | Expires: ${expiry(v)}</div>
      <div class="scratch">Scratch to reveal code</div>
    </div>`).join("")}</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`);
  printWin.document.close();
}

// ─── Template Manager ──────────────────────────────────────
function TemplateManager({ templates, onCreate, onDelete }: { templates: TemplateItem[]; onCreate: (body: Record<string, unknown>) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState({ name: "", denomination: "", description: "", validityDays: "30" });
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSave = () => {
    if (!form.name || !form.denomination) { toast.error("Name and denomination required"); return; }
    if (editingId) {
      apiFetch(`/api/vouchers/templates/${editingId}`, { method: "PUT", body: JSON.stringify(form) }).then(() => {
        toast.success("Template updated");
        setEditingId(null);
        setForm({ name: "", denomination: "", description: "", validityDays: "30" });
      }).catch(() => toast.error("Failed to update"));
      return;
    }
    onCreate(form);
    setForm({ name: "", denomination: "", description: "", validityDays: "30" });
  };

  const startEdit = (t: TemplateItem) => {
    setEditingId(t.id);
    setForm({ name: t.name, denomination: String(t.denomination), description: t.description, validityDays: String(t.validityDays) });
  };

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{editingId ? "Edit Template" : "Create Template"}</CardTitle></CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs font-medium">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly 500 Plan" /></div>
            <div className="space-y-1"><Label className="text-xs font-medium">Denomination (₹) *</Label><Input type="number" value={form.denomination} onChange={(e) => setForm({ ...form, denomination: e.target.value })} placeholder="500" /></div>
            <div className="space-y-1"><Label className="text-xs font-medium">Validity (days)</Label><Input type="number" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} placeholder="30" /></div>
            <div className="space-y-1"><Label className="text-xs font-medium">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" rows={1} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm" className="bg-red-600 hover:bg-red-700 text-white">
              {editingId ? <Pencil className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}{editingId ? "Update" : "Create"}
            </Button>
            {editingId && <Button variant="outline" size="sm" onClick={() => { setEditingId(null); setForm({ name: "", denomination: "", description: "", validityDays: "30" }); }}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>
      {templates.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><span className="font-medium text-sm truncate">{t.name}</span>{!t.isActive && <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-500">Inactive</Badge>}</div>
                <div className="text-xs text-muted-foreground">{formatINR(t.denomination)} • {t.validityDays} days {t.description && `• ${t.description}`}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => onDelete(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8"><LayoutTemplate className="h-8 w-8 text-muted-foreground/40 mb-2" /><p className="text-sm text-muted-foreground">No templates yet</p><p className="text-xs text-muted-foreground/70 mt-1">Create one above to speed up voucher generation</p></div>
      )}
    </div>
  );
}

// ─── Subscriber Search Dropdown ───────────────────────────
function SubscriberSearchDropdown({
  subscriberSearch,
  subscriberFilter,
  subscriberMatches,
  onSearchChange,
  onSelect,
  onClear,
}: {
  subscriberSearch: string;
  subscriberFilter: string;
  subscriberMatches: { id: string; name: string; code: string; phone?: string }[];
  onSearchChange: (v: string) => void;
  onSelect: (s: { id: string; name: string; code: string }) => void;
  onClear: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search subscriber..."
          value={subscriberFilter !== "ALL" ? subscriberSearch : subscriberSearch}
          onChange={(e) => { onSearchChange(e.target.value); setIsOpen(true); }}
          onFocus={() => { if (subscriberMatches.length > 0) setIsOpen(true); }}
          className="pl-9 pr-8"
        />
        {subscriberFilter !== "ALL" && (
          <button onClick={onClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      {isOpen && subscriberMatches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
          {subscriberMatches.map((s) => (
            <button key={s.id} className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between border-b last:border-b-0" onClick={() => { onSelect(s); setIsOpen(false); }}>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">({s.code})</span>
                {s.phone && <span className="text-muted-foreground">{s.phone}</span>}
              </div>
              <Badge variant="outline" className="text-[9px] h-4">Select</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Voucher Detail Dialog ────────────────────────────────
function VoucherDetailDialog({
  voucher,
  onClose,
  onPrint,
  onCancel,
}: {
  voucher: VoucherItem | null;
  onClose: () => void;
  onPrint: (v: VoucherItem) => void;
  onCancel: (id: string) => void;
}) {
  // Fetch full voucher detail with usage history via React Query
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["voucher-detail", voucher?.id],
    queryFn: () => apiFetch<{ voucher: VoucherDetail; usageHistory: unknown[] }>(`/api/vouchers/${voucher!.id}`),
    enabled: !!voucher,
  });
  const v = detailData?.voucher || voucher;

  return (
    <Dialog open={!!voucher} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        {v && (<>
          <DialogHeader><DialogTitle>Voucher Detail</DialogTitle><DialogDescription>Full voucher information and usage history</DialogDescription></DialogHeader>
          {detailLoading ? (
            <div className="space-y-3 p-4"><Skeleton className="skeleton-wave h-20 w-full" /><Skeleton className="skeleton-wave h-12 w-full" /><Skeleton className="skeleton-wave h-12 w-full" /></div>
          ) : (
            <div className="space-y-4">
              {/* Voucher Code Card */}
              <div className="text-center p-4 border rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Voucher Code</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-2xl font-mono font-bold tracking-wider">{v.code}</p>
                  <button onClick={() => { navigator.clipboard.writeText(v.code).then(() => toast.success("Copied")).catch(() => {}); }} className="text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></button>
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <StatusBadge status={v.status} />
                  <ExpiryBadge createdAt={v.createdAt} validityDays={v.validityDays} />
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Amount</p><p className="font-semibold">{formatINR(v.denomination)}</p></div>
                <div><p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Validity</p><p className="font-semibold">{v.validityDays} days</p></div>
                <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-semibold">{v.plan?.name || "Any Plan"}</p></div>
                <div><p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Created</p><p className="font-semibold">{new Date(v.createdAt).toLocaleDateString("en-IN")}</p></div>
              </div>

              {/* Redeemed By Section */}
              {v.usedBySubscriber && (
                <div className="border rounded-lg p-3 bg-teal-50/50">
                  <p className="text-xs font-medium text-teal-700 mb-2 flex items-center gap-1"><User className="h-3 w-3" /> Redeemed By</p>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{v.usedBySubscriber.name} <span className="text-muted-foreground font-normal">({v.usedBySubscriber.code})</span></p>
                    {"phone" in v.usedBySubscriber && (v.usedBySubscriber as { phone: string }).phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{(v.usedBySubscriber as { phone: string }).phone}</p>
                    )}
                    {v.usedAt && <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Redeemed: {new Date(v.usedAt).toLocaleString("en-IN")}</p>}
                  </div>
                </div>
              )}

              {/* Usage History Section */}
              {detailData && "usageHistory" in detailData && Array.isArray(detailData.usageHistory) && (detailData.usageHistory as unknown[]).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold flex items-center gap-1 mb-2"><History className="h-3.5 w-3.5 text-teal-600" /> Related Payment History</p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {(detailData.usageHistory as Array<{ id: string; amount: number; paymentMode: string; status: string; createdAt: string; invoice?: { invoiceNumber: string } | null }>).map((h) => (
                        <div key={h.id} className="flex items-center justify-between text-xs p-2 rounded border bg-muted/30">
                          <div>
                            <p className="font-medium">{formatINR(h.amount)} <span className="text-muted-foreground">({h.paymentMode})</span></p>
                            <p className="text-muted-foreground">{h.invoice?.invoiceNumber ? `Inv: ${h.invoice.invoiceNumber}` : "No invoice"}</p>
                          </div>
                          <div className="text-right">
                            <Badge variant={h.status === "VERIFIED" ? "outline" : "secondary"} className="text-[9px] h-4">{h.status}</Badge>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(h.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Expiry Info */}
              {(() => {
                const exp = getExpiryInfo(v.createdAt, v.validityDays);
                return (
                  <div className={`text-xs p-2 rounded ${exp.isExpired ? "bg-red-50 text-red-700" : exp.isExpiringSoon ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                    {exp.isExpired ? `Expired on ${exp.formattedExpiry}` : exp.isExpiringSoon ? `Expires in ${exp.daysUntilExpiry} day(s) (${exp.formattedExpiry})` : `Valid until ${exp.formattedExpiry}`}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onPrint(v)}><Printer className="h-4 w-4 mr-1" />Print</Button>
            {v.status === "ACTIVE" && <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => onCancel(v.id)}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </>)}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function VouchersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("vouchers");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expiryFilter, setExpiryFilter] = useState("ALL");
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscriberFilter, setSubscriberFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("25");

  // History tab state
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  // Generate dialog
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({ count: "10", denomination: "500", planId: "", validityDays: "30", templateId: "" });

  // Template dialog
  const [showTemplates, setShowTemplates] = useState(false);

  // Bulk import dialog
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/vouchers/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      return data;
    },
    onSuccess: (res) => {
      toast.success(`Imported ${res.created} voucher(s)${res.skipped ? `, ${res.skipped} skipped` : ""}`);
      setImportResult(res);
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-stats"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleImport = () => {
    if (!importFile) { toast.error("Select a CSV file first"); return; }
    setImportResult(null);
    importMutation.mutate(importFile);
  };

  const handleImportClose = () => {
    setShowImport(false);
    setImportFile(null);
    setImportResult(null);
  };

  // Voucher detail dialog
  const [detailVoucher, setDetailVoucher] = useState<VoucherItem | null>(null);

  // Selected vouchers for batch print
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ─── Queries ───────────────────────────────────────────
  const { data: statsData } = useQuery<VoucherStats>({
    queryKey: ["voucher-stats"],
    queryFn: () => apiFetch("/api/vouchers/stats"),
  });

  const { data, isLoading } = useQuery<{ vouchers: VoucherItem[]; total: number; page: number; limit: number }>({
    queryKey: ["vouchers", search, statusFilter, expiryFilter, subscriberFilter, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: page.toString(), limit: perPage });
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (expiryFilter !== "ALL") params.set("expiry", expiryFilter);
      if (subscriberFilter !== "ALL") params.set("subscriberId", subscriberFilter);
      return apiFetch(`/api/vouchers?${params}`);
    },
    enabled: activeTab === "vouchers",
  });

  // Dedicated usage history query for the History tab
  const { data: historyData, isLoading: historyLoading } = useQuery<{
    history: UsageHistoryItem[]; total: number; page: number; limit: number;
    summary: { totalRedeemed: number; totalValue: number };
  }>({
    queryKey: ["voucher-usage-history", historySearch, historyPage, perPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: historyPage.toString(), limit: perPage });
      if (historySearch) params.set("search", historySearch);
      return apiFetch(`/api/vouchers/usage-history?${params}`);
    },
    enabled: activeTab === "history",
  });

  const { data: templatesData } = useQuery<{ templates: TemplateItem[] }>({
    queryKey: ["voucher-templates"],
    queryFn: () => apiFetch("/api/vouchers/templates"),
  });

  const { data: plansData } = useQuery({
    queryKey: ["plans-vouchers"],
    queryFn: () => apiFetch("/api/plans?limit=100&status=ACTIVE").catch(() => ({ items: [] })),
    enabled: showGenerate,
  });

  const { data: subscribersData } = useQuery({
    queryKey: ["subscribers-vouchers", subscriberSearch],
    queryFn: () => apiFetch(`/api/subscribers?limit=20&search=${encodeURIComponent(subscriberSearch)}`).catch(() => ({ subscribers: [] })),
    enabled: subscriberSearch.length >= 2,
  });

  // ─── Mutations ─────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/vouchers/generate", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      toast.success(`${res.count || 1} voucher(s) generated`);
      setShowGenerate(false);
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-stats"] });
    },
    onError: () => toast.error("Failed to generate vouchers"),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/vouchers/templates", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Template created"); queryClient.invalidateQueries({ queryKey: ["voucher-templates"] }); },
    onError: () => toast.error("Failed to create template"),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/vouchers/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Template deleted"); queryClient.invalidateQueries({ queryKey: ["voucher-templates"] }); },
    onError: () => toast.error("Failed to delete template"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/vouchers/${id}`, { method: "PUT", body: JSON.stringify({ status: "CANCELLED" }) }),
    onSuccess: () => { toast.success("Voucher cancelled"); setDetailVoucher(null); queryClient.invalidateQueries({ queryKey: ["vouchers"] }); queryClient.invalidateQueries({ queryKey: ["voucher-stats"] }); },
    onError: () => toast.error("Failed to cancel voucher"),
  });

  // ─── Computed ──────────────────────────────────────────
  const vouchers = data?.vouchers || [];
  const total = data?.total || 0;
  const limit = parseInt(perPage);
  const totalPages = Math.ceil(total / limit);
  const templates = templatesData?.templates || [];
  const plans = (plansData?.items || plansData?.plans || []) as { id: string; name: string }[];
  const subscribers = (subscribersData?.subscribers || subscribersData?.items || []) as { id: string; name: string; code: string; phone?: string }[];
  const stats = statsData || { total: 0, active: 0, used: 0, expired: 0, cancelled: 0 };
  const subscriberMatches = subscribers.length > 0 ? subscribers : [];

  // History data
  const historyItems = historyData?.history || [];
  const historyTotal = historyData?.total || 0;
  const historyTotalPages = Math.ceil(historyTotal / limit);
  const historySummary = historyData?.summary || { totalRedeemed: 0, totalValue: 0 };

  // ─── Handlers ──────────────────────────────────────────
  const handleGenerate = () => {
    const count = parseInt(genForm.count) || 1;
    const body: Record<string, unknown> = { count, denomination: genForm.denomination, validityDays: genForm.validityDays || 30 };
    if (genForm.planId) body.planId = genForm.planId;
    if (genForm.templateId) body.templateId = genForm.templateId;
    generateMutation.mutate(body);
  };

  const handleUseTemplate = (t: TemplateItem) => {
    setGenForm({ ...genForm, denomination: String(t.denomination), validityDays: String(t.validityDays), templateId: t.id });
  };

  const toggleSelect = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleAll = () => { if (selectedIds.length === vouchers.length) setSelectedIds([]); else setSelectedIds(vouchers.map((v) => v.id)); };

  const handleBatchPrint = () => {
    const selected = vouchers.filter((v) => selectedIds.includes(v.id));
    if (selected.length === 0) { toast.error("No vouchers selected"); return; }
    printVoucherCards(selected);
  };

  const handlePrintAll = () => {
    if (vouchers.length === 0) { toast.error("No vouchers to print"); return; }
    printVoucherCards(vouchers);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => toast.success("Code copied")).catch(() => toast.error("Failed to copy"));
  };

  const clearAllFilters = () => {
    setSearch(""); setStatusFilter("ALL"); setExpiryFilter("ALL"); setSubscriberFilter("ALL"); setSubscriberSearch(""); setPage(1);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vouchers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Generate, manage, and track vouchers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePrintAll}><Printer className="h-4 w-4 mr-1" />Print All</Button>
          {selectedIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleBatchPrint}><Printer className="h-4 w-4 mr-1" />Print ({selectedIds.length})</Button>
          )}
          <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><LayoutTemplate className="h-4 w-4 mr-1" />Templates</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Voucher Templates</DialogTitle><DialogDescription>Create and manage reusable voucher templates with pre-defined plan, price, and validity</DialogDescription></DialogHeader>
              <TemplateManager templates={templates} onCreate={(body) => createTemplateMutation.mutate(body)} onDelete={(id) => deleteTemplateMutation.mutate(id)} />
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}><Download className="h-4 w-4 mr-1" />Import CSV</Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowGenerate(true)}><Plus className="h-4 w-4 mr-1" />Generate</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><Ticket className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total</p></div><p className="text-xl font-bold tabular-nums">{stats.total}</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-green-100 text-green-600"><CheckCircle2 className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Active</p></div><p className="text-xl font-bold tabular-nums text-green-600">{stats.active}</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><Eye className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Used</p></div><p className="text-xl font-bold tabular-nums">{stats.used}</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><AlertTriangle className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Expiring Soon</p></div><p className="text-xl font-bold tabular-nums text-amber-600">{vouchers.filter((v) => v.status === "ACTIVE" && getExpiryInfo(v.createdAt, v.validityDays).isExpiringSoon).length}</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-red-100 text-red-600"><XCircle className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Expired</p></div><p className="text-xl font-bold tabular-nums text-red-600">{stats.expired}</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === "history") setHistoryPage(1); }}>
        <TabsList>
          <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
          <TabsTrigger value="history">Usage History</TabsTrigger>
        </TabsList>

        {/* ═══ Vouchers Tab ═══ */}
        <TabsContent value="vouchers" className="space-y-4 mt-4">
          {/* Filters */}
          <Card className="border shadow-sm"><CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search code..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="USED">Used</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={expiryFilter} onValueChange={(v) => { setExpiryFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="Expiry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Expiry</SelectItem>
                  <SelectItem value="VALID">Active (Valid)</SelectItem>
                  <SelectItem value="EXPIRING_SOON">Expiring Soon (≤7d)</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
              {/* Subscriber Search Filter */}
              <SubscriberSearchDropdown
                subscriberSearch={subscriberSearch}
                subscriberFilter={subscriberFilter}
                subscriberMatches={subscriberMatches}
                onSearchChange={(v) => { setSubscriberSearch(v); if (subscriberFilter !== "ALL") { setSubscriberFilter("ALL"); } }}
                onSelect={(s) => { setSubscriberFilter(s.id); setSubscriberSearch(s.name); setPage(1); }}
                onClear={() => { setSubscriberFilter("ALL"); setSubscriberSearch(""); setPage(1); }}
              />
              <div className="flex gap-2 items-center justify-end">
                <Button variant="outline" size="sm" onClick={clearAllFilters}><Filter className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent></Card>

          {/* Selection bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-teal-50 border border-teal-200">
              <Badge variant="outline" className="bg-teal-100 text-teal-700 border-teal-200">{selectedIds.length} selected</Badge>
              <Button variant="outline" size="sm" onClick={handleBatchPrint}><Printer className="h-3.5 w-3.5 mr-1" />Print Selected</Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds([])} className="ml-auto"><X className="h-3.5 w-3.5" /></Button>
            </div>
          )}

          {/* Table */}
          <Card className="border shadow-sm"><CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : vouchers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16"><Ticket className="h-12 w-12 text-muted-foreground/40 mb-3" /><p className="text-muted-foreground font-medium">No vouchers found</p><p className="text-sm text-muted-foreground/70 mt-1">Generate new vouchers or adjust filters</p></div>
            ) : (
              <div className="overflow-x-auto">
                <Table><TableHeader><TableRow>
                  <TableHead className="w-10"><Checkbox checked={selectedIds.length === vouchers.length && vouchers.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Expiry</TableHead>
                  <TableHead className="text-xs">Used By</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow></TableHeader><TableBody>{vouchers.map((v) => (
                  <TableRow key={v.id} className="hover:bg-muted/50">
                    <TableCell><Checkbox checked={selectedIds.includes(v.id)} onCheckedChange={() => toggleSelect(v.id)} /></TableCell>
                    <TableCell><div className="flex items-center gap-2"><code className="text-xs font-mono font-semibold bg-muted px-2 py-1 rounded">{v.code}</code><button onClick={() => handleCopyCode(v.code)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button></div></TableCell>
                    <TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(v.denomination)}</TableCell>
                    <TableCell className="text-xs">{v.plan?.name || "—"}</TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                    <TableCell><ExpiryBadge createdAt={v.createdAt} validityDays={v.validityDays} /></TableCell>
                    <TableCell className="text-xs">{v.usedBySubscriber ? (<div><p className="font-medium">{v.usedBySubscriber.name}</p><p className="text-[10px] text-muted-foreground">{v.usedBySubscriber.code}</p></div>) : "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(v.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDetailVoucher(v)} title="View details"><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => printVoucherCards([v])} title="Print"><Printer className="h-3.5 w-3.5" /></Button>
                        {v.status === "ACTIVE" && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => cancelMutation.mutate(v.id)} title="Cancel voucher"><XCircle className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}</TableBody></Table>
              </div>
            )}
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}</p>
                  <Select value={perPage} onValueChange={(v) => { setPerPage(v); setPage(1); }}><SelectTrigger className="h-7 w-16 text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent></Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let pn: number; if (totalPages <= 5) pn = i + 1; else if (page <= 3) pn = i + 1; else if (page >= totalPages - 2) pn = totalPages - 4 + i; else pn = page - 2 + i; return (<Button key={pn} variant={page === pn ? "default" : "outline"} size="sm" className="h-7 w-8 text-xs" onClick={() => setPage(pn)}>{pn}</Button>); })}
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* ═══ Usage History Tab ═══ */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* History Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><History className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total Redeemed</p></div><p className="text-xl font-bold tabular-nums">{historySummary.totalRedeemed}</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-green-100 text-green-600"><CheckCircle2 className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total Redeemed Value</p></div><p className="text-xl font-bold tabular-nums text-green-600">{formatINR(historySummary.totalValue)}</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><AlertTriangle className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Avg. Value</p></div><p className="text-xl font-bold tabular-nums">{historySummary.totalRedeemed > 0 ? formatINR(Math.round(historySummary.totalValue / historySummary.totalRedeemed)) : "—"}</p></CardContent></Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><History className="h-4 w-4 text-teal-600" />Redemption History</CardTitle>
              <CardDescription>Track who redeemed each voucher and when</CardDescription>
            </CardHeader>
            <CardContent>
              {/* History Search */}
              <div className="mb-4">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by code, subscriber name, code, or phone..." value={historySearch} onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }} className="pl-9" />
                </div>
              </div>

              {historyLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : historyItems.length > 0 ? (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table><TableHeader><TableRow>
                    <TableHead className="text-xs">Voucher Code</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Subscriber</TableHead>
                    <TableHead className="text-xs">Phone</TableHead>
                    <TableHead className="text-xs">Plan</TableHead>
                    <TableHead className="text-xs">Redeemed At</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {historyItems.map((v) => (
                      <TableRow key={v.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => setDetailVoucher(v as unknown as VoucherItem)}>
                        <TableCell className="font-mono text-xs font-semibold">{v.code}</TableCell>
                        <TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(v.denomination)}</TableCell>
                        <TableCell className="text-xs font-medium">
                          <div className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{v.usedBySubscriber?.name || "—"}</div>
                          <p className="text-[10px] text-muted-foreground ml-4">{v.usedBySubscriber?.code || ""}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{v.usedBySubscriber?.phone || "—"}</TableCell>
                        <TableCell className="text-xs">{v.plan?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{v.usedAt ? new Date(v.usedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody></Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16"><History className="h-12 w-12 text-muted-foreground/40 mb-3" /><p className="text-muted-foreground font-medium">No redemption history</p><p className="text-sm text-muted-foreground/70 mt-1">When vouchers are redeemed, the events will appear here</p></div>
              )}

              {/* History Pagination */}
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between border-t mt-4 pt-3">
                  <p className="text-xs text-muted-foreground">{(historyPage - 1) * limit + 1}-{Math.min(historyPage * limit, historyTotal)} of {historyTotal}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    {Array.from({ length: Math.min(5, historyTotalPages) }, (_, i) => { let pn: number; if (historyTotalPages <= 5) pn = i + 1; else if (historyPage <= 3) pn = i + 1; else if (historyPage >= historyTotalPages - 2) pn = historyTotalPages - 4 + i; else pn = historyPage - 2 + i; return (<Button key={pn} variant={historyPage === pn ? "default" : "outline"} size="sm" className="h-7 w-8 text-xs" onClick={() => setHistoryPage(pn)}>{pn}</Button>); })}
                    <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage(historyPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ Generate Dialog ═══ */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generate Vouchers</DialogTitle><DialogDescription>Create new vouchers with custom denomination and validity</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Quick Fill from Template</Label>
                <div className="flex flex-wrap gap-2">
                  {templates.filter((t) => t.isActive).slice(0, 4).map((t) => (
                    <Button key={t.id} variant="outline" size="sm" className="text-xs h-7" onClick={() => handleUseTemplate(t)}>{t.name} ({formatINR(t.denomination)})</Button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs font-medium">Count *</Label><Input type="number" min="1" max="500" value={genForm.count} onChange={(e) => setGenForm({ ...genForm, count: e.target.value })} placeholder="10" /></div>
              <div className="space-y-1"><Label className="text-xs font-medium">Denomination (₹) *</Label><Input type="number" min="1" value={genForm.denomination} onChange={(e) => setGenForm({ ...genForm, denomination: e.target.value })} placeholder="500" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs font-medium">Validity (days)</Label><Input type="number" min="1" value={genForm.validityDays} onChange={(e) => setGenForm({ ...genForm, validityDays: e.target.value })} placeholder="30" /></div>
              <div className="space-y-1"><Label className="text-xs font-medium">Plan (optional)</Label>
                <Select value={genForm.planId} onValueChange={(v) => setGenForm({ ...genForm, planId: v })}><SelectTrigger><SelectValue placeholder="Any plan" /></SelectTrigger><SelectContent><SelectItem value="__all__">Any plan</SelectItem>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate {genForm.count} Voucher(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Import CSV Dialog ═══ */}
      <Dialog open={showImport} onOpenChange={handleImportClose}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle><Download className="h-5 w-5 mr-2 inline" />Import Vouchers from CSV</DialogTitle><DialogDescription>Upload a CSV file to bulk-create vouchers. Max 500 vouchers per import.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <Download className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {importFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{importFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(importFile.size / 1024).toFixed(1)} KB</p>
                  <Button variant="ghost" size="sm" className="text-xs text-red-600 mt-1" onClick={() => { setImportFile(null); setImportResult(null); }}>Remove</Button>
                </div>
              ) : (
                <Label htmlFor="csv-upload" className="cursor-pointer">
                  <Input id="csv-upload" type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }} />
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm text-muted-foreground">Click to select CSV file</p>
                    <p className="text-[10px] text-muted-foreground">Max 5MB • CSV format</p>
                  </div>
                </Label>
              )}
            </div>

            {/* Import Result */}
            {importResult && (
              <div className={`rounded-lg p-3 text-xs space-y-1 ${importResult.errors.length > 0 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
                <p className="font-semibold">{importResult.created} voucher(s) created{importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}</p>
                {importResult.errors.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="font-medium text-amber-700">Errors ({importResult.errors.length}):</p>
                    {importResult.errors.slice(0, 5).map((err, i) => <p key={i} className="text-amber-600">{err}</p>)}
                    {importResult.errors.length > 5 && <p className="text-amber-500">...and {importResult.errors.length - 5} more</p>}
                  </div>
                )}
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
              <p className="font-semibold">CSV Format Requirements:</p>
              <p>Required columns: <code className="bg-muted px-1 rounded">denomination</code> (or amount/price/value)</p>
              <p>Optional: <code className="bg-muted px-1 rounded">plan</code>, <code className="bg-muted px-1 rounded">validity_days</code>, <code className="bg-muted px-1 rounded">count</code>, <code className="bg-muted px-1 rounded">prefix</code></p>
              <p className="text-muted-foreground mt-1">Example: denomination,plan,validity_days,count</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleImportClose}>Close</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleImport} disabled={!importFile || importMutation.isPending}>
              {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Vouchers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Detail Dialog ═══ */}
      <VoucherDetailDialog
        voucher={detailVoucher}
        onClose={() => setDetailVoucher(null)}
        onPrint={(v) => printVoucherCards([v])}
        onCancel={(id) => cancelMutation.mutate(id)}
      />
    </div>
  );
}
