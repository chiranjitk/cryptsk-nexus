"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import {
  Receipt, Calendar, FileText, BarChart3, Download, RefreshCw, Plus, Edit2, Trash2,
  AlertTriangle, Info, Shield, Landmark, Building2, CheckCircle2, XCircle, IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

interface GstStats {
  totalTax: number; thisMonthTax: number; quarterTax: number; invoiceCount: number;
}

interface MonthlyBreakdown {
  month: string; revenue: number; cgst: number; sgst: number; igst: number; totalTax: number; invoiceCount: number;
}

interface Gstr1Invoice {
  id: string; invoiceNumber: string; subscriberName: string; gstin: string; pan: string;
  invoiceValue: number; taxAmount: number; cgst: number; sgst: number; igst: number;
  placeOfSupply: string; issueDate: string;
}

interface HsnCode {
  code: string; description: string; taxRate: number; totalInvoices: number; totalValue: number; planNames: string[];
}

// TDS/TCS types
interface TdsEntry {
  id: string; type: string; section: string; description: string; invoiceNumber: string;
  subscriberName: string; panNumber: string; baseAmount: number; tdsRate: number;
  tdsAmount: number; status: string; depositedDate: string | null; challanNumber: string;
  period: string; notes: string; createdAt: string;
}

interface TdsSummary {
  totalDeducted: number; totalDeposited: number; totalPending: number;
}

interface TdsSectionSummary {
  section: string; count: number; totalAmount: number; deposited: number;
}

// GSTR-9 types
interface Gstr9Monthly {
  month: string; outward: number; tax: number; count: number; igst: number; cgst: number; sgst: number;
}

// Audit types
interface AuditInvoice {
  id: string; invoiceNumber: string; issueDate: string; subscriberName: string;
  taxableValue: number; cgstRate: number; sgstRate: number; igstRate: number;
  cgstAmount: number; sgstAmount: number; igstAmount: number;
  expectedCgst: number; expectedSgst: number; expectedIgst: number;
  cgstVariance: number; sgstVariance: number; igstVariance: number;
  totalTax: number; reverseCharge: boolean; tdsDeducted: boolean;
  tdsAmount: number; tdsRate: number; status: string; hasDiscrepancy: boolean;
}

// Reverse charge types
interface RcInvoice {
  id: string; invoiceNumber: string; subscriberName: string; subscriberGstin: string;
  invoiceValue: number; totalTax: number; cgst: number; sgst: number; igst: number;
  tdsAmount: number; tdsDeducted: boolean; status: string; issueDate: string;
}

// Composite types
interface CompositeData {
  compositeScheme: boolean; compositeSchemeRate: number; gstin: string;
  companyName: string; currentTurnover: number; turnoverLimit: number;
  isEligible: boolean; itcAvailable: boolean;
}

function StatCard({ title, value, subtitle, icon: Icon, gradient, delay }: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string; delay: number;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg animate-card-enter`} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
            <p className="text-xs mt-1 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

const formatCurrency = (v: number) => `₹${v.toLocaleString("en-IN")}`;

function TaxBarChart({ data }: { data: MonthlyBreakdown[] }) {
  const maxTax = Math.max(...data.map((d) => d.totalTax), 1);
  const reversed = [...data].reverse();
  return (
    <div className="flex items-end gap-2 h-48 mt-4">
      {reversed.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
          <div className="relative w-full flex flex-col items-center" style={{ height: "160px" }}>
            <div className="absolute bottom-0 w-full flex flex-col justify-end gap-0.5" style={{ height: "160px" }}>
              <div className="w-full rounded-t-sm bg-green-400 transition-all" style={{ height: `${(m.cgst / maxTax) * 140}px` }} title={`CGST: ${formatCurrency(m.cgst)}`} />
              <div className="w-full bg-amber-400 transition-all" style={{ height: `${(m.sgst / maxTax) * 140}px` }} title={`SGST: ${formatCurrency(m.sgst)}`} />
              <div className="w-full rounded-b-sm bg-teal-400 transition-all" style={{ height: `${(m.igst / maxTax) * 140}px` }} title={`IGST: ${formatCurrency(m.igst)}`} />
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground">{m.month}</span>
        </div>
      ))}
    </div>
  );
}

export default function GstTaxPage() {
  const [activeTab, setActiveTab] = useState("summary");
  const [periodSelector, setPeriodSelector] = useState("monthly");
  const [hsnDialogOpen, setHsnDialogOpen] = useState(false);
  const [hsnForm, setHsnForm] = useState({ code: "", description: "", taxRate: "18" });
  const [editingHsn, setEditingHsn] = useState<HsnCode | null>(null);
  const [deleteHsnCode, setDeleteHsnCode] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // TDS dialog state
  const [tdsDialogOpen, setTdsDialogOpen] = useState(false);
  const [tdsForm, setTdsForm] = useState({ type: "TDS", section: "194C", description: "", panNumber: "", baseAmount: "", tdsRate: "2", period: "", notes: "" });

  // GSTR-9 year selector
  const now = new Date();
  const currentFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [gstr9Year, setGstr9Year] = useState(String(currentFy));

  // Fetch tax summary
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<{
    stats: GstStats; totalCgst: number; totalSgst: number; totalIgst: number; monthlyBreakdown: MonthlyBreakdown[];
  }>({
    queryKey: ["gst-summary"],
    queryFn: () => apiFetch("/api/gst?report=summary"),
  });

  // Fetch GSTR-1
  const { data: gstr1Data, isLoading: gstr1Loading } = useQuery<{ b2bInvoices: Gstr1Invoice[] }>({
    queryKey: ["gst-gstr1"],
    queryFn: () => apiFetch("/api/gst?report=gstr1"),
    enabled: activeTab === "gstr1",
  });

  // Fetch GSTR-3B
  const { data: gstr3bData, isLoading: gstr3bLoading } = useQuery<{
    outwardSupply: number; taxableValue: number; inputTaxCredit: number;
    cgstPayable: number; sgstPayable: number; igstPayable: number;
    totalTaxPayable: number; quarterBreakdown: { month: string; tax: number; count: number }[];
  }>({
    queryKey: ["gst-gstr3b"],
    queryFn: () => apiFetch("/api/gst?report=gstr3b"),
    enabled: activeTab === "gstr3b",
  });

  // Fetch HSN codes
  const { data: hsnData, isLoading: hsnLoading } = useQuery<{ hsnCodes: HsnCode[] }>({
    queryKey: ["gst-hsn"],
    queryFn: () => apiFetch("/api/gst?report=hsn"),
    enabled: activeTab === "hsn",
  });

  // ── TDS/TCS Data ──
  const { data: tdsData, isLoading: tdsLoading, refetch: refetchTds } = useQuery<{
    entries: TdsEntry[]; summary: TdsSummary; sectionSummary: TdsSectionSummary[];
  }>({
    queryKey: ["gst-tds"],
    queryFn: () => apiFetch("/api/gst/tds-tcs"),
    enabled: activeTab === "tds",
  });

  const tdsMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/gst/tds-tcs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json(); if (!res.ok || data.error) throw new Error(data.error || "Failed"); return data;
    },
    onSuccess: (d, vars) => {
      toast.success(d.message || "TDS entry saved");
      setTdsDialogOpen(false);
      setTdsForm({ type: "TDS", section: "194C", description: "", panNumber: "", baseAmount: "", tdsRate: "2", period: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["gst-tds"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTdsMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/gst/tds-tcs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
      const data = await res.json(); if (!res.ok || data.error) throw new Error(data.error || "Failed"); return data;
    },
    onSuccess: () => { toast.success("Entry deleted"); queryClient.invalidateQueries({ queryKey: ["gst-tds"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── GSTR-9 Data ──
  const { data: gstr9Data, isLoading: gstr9Loading } = useQuery<{
    financialYear: string; gstin: string; companyName: string; compositeScheme: boolean;
    compositeSchemeRate: number; totalOutward: number; totalTax: number; totalCgst: number;
    totalSgst: number; totalIgst: number; totalTds: number; totalInvoices: number;
    reverseChargeTotal: number; reverseChargeCount: number; creditNoteTotal: number;
    creditNoteCount: number; netTaxPayable: number;
    monthlyBreakdown: Gstr9Monthly[]; quarterlyBreakdown: { quarter: string; tax: number; count: number }[];
  }>({
    queryKey: ["gst-gstr9", gstr9Year],
    queryFn: () => apiFetch(`/api/gst/gstr9?year=${gstr9Year}`),
    enabled: activeTab === "gstr9",
  });

  // ── Audit Data ──
  const { data: auditData, isLoading: auditLoading } = useQuery<{
    invoices: AuditInvoice[]; total: number; page: number; limit: number; totalPages: number;
    summary: { totalInvoices: number; discrepancyCount: number; discrepancyRate: string; totalTax: number };
  }>({
    queryKey: ["gst-audit"],
    queryFn: () => apiFetch("/api/gst/audit?limit=50"),
    enabled: activeTab === "audit",
  });

  // ── Reverse Charge Data ──
  const { data: rcData, isLoading: rcLoading, refetch: refetchRc } = useQuery<{
    invoices: RcInvoice[]; totalInvoices: number; totalValue: number; totalTax: number;
  }>({
    queryKey: ["gst-rc"],
    queryFn: () => apiFetch("/api/gst/reverse-charge"),
    enabled: activeTab === "reverse",
  });

  // ── Composite Data ──
  const { data: compositeData, isLoading: compositeLoading, refetch: refetchComposite } = useQuery<CompositeData>({
    queryKey: ["gst-composite"],
    queryFn: () => apiFetch("/api/gst/composite"),
    enabled: activeTab === "composite",
  });

  // Fetch ISP profile for GSTIN display
  const { data: ispProfile } = useQuery<{ success: boolean; settings: { gstin?: string } }>({
    queryKey: ["isp-profile"],
    queryFn: () => apiFetch("/api/settings/isp-profile"),
  });

  const displayGstin = ispProfile?.settings?.gstin || "Not configured";

  const compositeMutation = useMutation({
    mutationFn: async (body: { compositeScheme: boolean; compositeSchemeRate?: number }) => {
      const res = await fetch("/api/gst/composite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json(); if (!res.ok || data.error) throw new Error(data.error || "Failed"); return data;
    },
    onSuccess: (d) => { toast.success(d.message); queryClient.invalidateQueries({ queryKey: ["gst-composite"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const hsnMutation = useMutation({
    mutationFn: async (body: { action: string; code?: string; description?: string; taxRate?: number }) => {
      const res = await fetch("/api/gst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json(); if (!res.ok || data.error) throw new Error(data.error || "Failed"); return data;
    },
    onSuccess: (d) => { toast.success(d.message || "HSN/SAC code saved"); setHsnDialogOpen(false); setHsnForm({ code: "", description: "", taxRate: "18" }); setEditingHsn(null); queryClient.invalidateQueries({ queryKey: ["gst-hsn"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteHsnMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/gst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_hsn", code }) });
      const data = await res.json(); if (!res.ok || data.error) throw new Error(data.error || "Failed"); return data;
    },
    onSuccess: (d) => { toast.success(d.message || "HSN deleted"); setDeleteHsnCode(null); queryClient.invalidateQueries({ queryKey: ["gst-hsn"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveHsn = () => { if (!hsnForm.code || !hsnForm.description) return; hsnMutation.mutate({ action: editingHsn ? "edit_hsn" : "add_hsn", code: hsnForm.code, description: hsnForm.description, taxRate: Number(hsnForm.taxRate) || 18 }); };
  const openEditHsn = (h: HsnCode) => { setEditingHsn(h); setHsnForm({ code: h.code, description: h.description, taxRate: String(h.taxRate) }); setHsnDialogOpen(true); };

  // Period-filtered monthly data
  const filteredMonthly = (() => {
    const monthly = summaryData?.monthlyBreakdown || [];
    if (periodSelector === "quarterly") {
      const seen = new Set<string>();
      return monthly.filter((m) => {
        const key = m.month.slice(3);
        if (!seen.has(key)) { seen.add(key); return true; }
        return false;
      });
    }
    return monthly;
  })();

  const exportCsv = useCallback((filename: string, headers: string[], rows: (string | number)[][]) => {
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; a.click();
    toast.success(`${filename} exported`);
  }, []);

  const exportGstr1Csv = () => {
    if (!gstr1Data?.b2bInvoices) return;
    exportCsv("GSTR1_Report", ["Invoice #", "Subscriber", "GSTIN", "PAN", "Value", "Tax", "CGST", "SGST", "IGST"],
      gstr1Data.b2bInvoices.map((i) => [i.invoiceNumber, i.subscriberName, i.gstin, i.pan, i.invoiceValue, i.taxAmount, i.cgst, i.sgst, i.igst]));
  };

  const exportHsnCsv = () => {
    if (!hsnData?.hsnCodes) return;
    exportCsv("HSN_Codes", ["HSN Code", "Description", "Tax Rate", "Invoices", "Total Value"],
      hsnData.hsnCodes.map((h) => [h.code, h.description, `${h.taxRate}%`, h.totalInvoices, h.totalValue]));
  };

  const stats = summaryData?.stats || { totalTax: 0, thisMonthTax: 0, quarterTax: 0, invoiceCount: 0 };

  if (summaryLoading) {
    return (<div className="space-y-6"><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => (<Card key={i}><CardContent className="p-5"><Skeleton className="skeleton-wave h-4 w-24 mb-3" /><Skeleton className="skeleton-wave h-8 w-16" /></CardContent></Card>))}</div><Skeleton className="skeleton-wave h-96 w-full" /></div>);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">GST / Tax Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">GST compliance, returns & tax analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetchSummary()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Tax Collected" value={formatCurrency(stats.totalTax)} subtitle={`CGST ${formatCurrency(summaryData?.totalCgst || 0)} + SGST ${formatCurrency(summaryData?.totalSgst || 0)}`} icon={Receipt} gradient="stat-gradient-red" delay={0} />
        <StatCard title="This Month" value={formatCurrency(stats.thisMonthTax)} subtitle="Current month tax" icon={Calendar} gradient="stat-gradient-green" delay={75} />
        <StatCard title="This Quarter" value={formatCurrency(stats.quarterTax)} subtitle="Quarterly tax" icon={BarChart3} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="Invoices Count" value={stats.invoiceCount} subtitle="Total taxable invoices" icon={FileText} gradient="stat-gradient-purple" delay={225} />
      </div>

      {/* Period Selector */}
      <Card className="border shadow-sm">
        <CardContent className="p-3 flex items-center gap-3">
          <Label className="text-xs font-medium">Period View:</Label>
          <Select value={periodSelector} onValueChange={setPeriodSelector}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem></SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="summary">Tax Summary</TabsTrigger>
          <TabsTrigger value="gstr1">GSTR-1</TabsTrigger>
          <TabsTrigger value="gstr3b">GSTR-3B</TabsTrigger>
          <TabsTrigger value="gstr9">GSTR-9</TabsTrigger>
          <TabsTrigger value="tds">TDS/TCS</TabsTrigger>
          <TabsTrigger value="audit">GST Audit</TabsTrigger>
          <TabsTrigger value="reverse">Reverse Charge</TabsTrigger>
          <TabsTrigger value="composite">Composite</TabsTrigger>
          <TabsTrigger value="hsn">HSN/SAC</TabsTrigger>
        </TabsList>

        {/* ═══ Tax Summary ═══ */}
        <TabsContent value="summary" className="mt-6 space-y-6">
          <Card className="border shadow-sm bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-600"><Receipt className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-medium text-green-700">ISP GSTIN</p>
                <p className="text-lg font-mono font-bold tracking-wider mt-0.5" id="gstin-display">{displayGstin}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Monthly Tax Collection</CardTitle>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-green-400" /><span className="text-xs text-muted-foreground">CGST</span></div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-amber-400" /><span className="text-xs text-muted-foreground">SGST</span></div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-teal-400" /><span className="text-xs text-muted-foreground">IGST</span></div>
              </div>
            </CardHeader>
            <CardContent>{filteredMonthly.length > 0 ? <TaxBarChart data={filteredMonthly} /> : <p className="text-center text-muted-foreground py-12 text-sm">No tax data</p>}</CardContent>
          </Card>
          <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Monthly Tax Breakdown</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Month</TableHead><TableHead className="text-xs font-medium uppercase text-right">Revenue</TableHead><TableHead className="text-xs font-medium uppercase text-right">CGST (9%)</TableHead><TableHead className="text-xs font-medium uppercase text-right">SGST (9%)</TableHead><TableHead className="text-xs font-medium uppercase text-right">IGST (18%)</TableHead><TableHead className="text-xs font-medium uppercase text-right">Total Tax</TableHead><TableHead className="text-xs font-medium uppercase text-right">Invoices</TableHead></TableRow></TableHeader><TableBody>{filteredMonthly.length === 0 ? (<TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No data</TableCell></TableRow>) : filteredMonthly.map((m, i) => (<TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-medium text-sm">{m.month}</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(m.revenue)}</TableCell><TableCell className="text-right tabular-nums text-sm text-green-700">{formatCurrency(m.cgst)}</TableCell><TableCell className="text-right tabular-nums text-sm text-amber-700">{formatCurrency(m.sgst)}</TableCell><TableCell className="text-right tabular-nums text-sm text-teal-700">{formatCurrency(m.igst)}</TableCell><TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(m.totalTax)}</TableCell><TableCell className="text-right tabular-nums text-sm">{m.invoiceCount}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
        </TabsContent>

        {/* ═══ GSTR-1 ═══ */}
        <TabsContent value="gstr1" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">B2B Outward Supply details for GST filing</p>
            <Button variant="outline" onClick={exportGstr1Csv} disabled={gstr1Loading}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          </div>
          <Card className="border shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto max-h-[500px] overflow-y-auto">{gstr1Loading ? (<div className="p-8 flex items-center justify-center"><Skeleton className="skeleton-wave h-8 w-48" /></div>) : (<Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Invoice #</TableHead><TableHead className="text-xs font-medium uppercase">Subscriber</TableHead><TableHead className="text-xs font-medium uppercase">GSTIN</TableHead><TableHead className="text-xs font-medium uppercase">PAN</TableHead><TableHead className="text-xs font-medium uppercase text-right">Value</TableHead><TableHead className="text-xs font-medium uppercase text-right">Tax</TableHead><TableHead className="text-xs font-medium uppercase">Supply</TableHead></TableRow></TableHeader><TableBody>{(!gstr1Data?.b2bInvoices || gstr1Data.b2bInvoices.length === 0) ? (<TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No B2B invoices</TableCell></TableRow>) : gstr1Data.b2bInvoices.map((inv) => (<TableRow key={inv.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell><TableCell className="text-sm font-medium">{inv.subscriberName}</TableCell><TableCell className="font-mono text-xs">{inv.gstin}</TableCell><TableCell className="font-mono text-xs">{inv.pan}</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(inv.invoiceValue)}</TableCell><TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(inv.taxAmount)}</TableCell><TableCell className="text-sm"><Badge variant="outline" className={`text-[10px] ${inv.igst > 0 ? "bg-teal-100 text-teal-700 border-teal-200" : "bg-green-50 text-green-700"}`}>{inv.igst > 0 ? "IGST" : "CGST+SGST"}</Badge></TableCell></TableRow>))}</TableBody></Table>)}</div></CardContent></Card>
        </TabsContent>

        {/* ═══ GSTR-3B ═══ */}
        <TabsContent value="gstr3b" className="mt-6 space-y-6">
          {gstr3bLoading ? (<div className="grid grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>) : (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outward Supply</p><p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(gstr3bData?.outwardSupply || 0)}</p></CardContent></Card>
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taxable Value</p><p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(gstr3bData?.taxableValue || 0)}</p></CardContent></Card>
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Input Tax Credit</p><p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(gstr3bData?.inputTaxCredit || 0)}</p></CardContent></Card>
              <Card className="border bg-red-50"><CardContent className="p-4"><p className="text-xs text-red-600">Net Tax Payable</p><p className="text-xl font-bold mt-1 tabular-nums text-red-700">{formatCurrency(gstr3bData?.totalTaxPayable || 0)}</p></CardContent></Card>
            </div>
            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Tax Payable Breakdown</CardTitle></CardHeader><CardContent><div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-green-50 border border-green-200"><p className="text-xs text-green-600 font-medium">CGST Payable</p><p className="text-lg font-bold text-green-700 mt-1 tabular-nums">{formatCurrency(gstr3bData?.cgstPayable || 0)}</p></div>
              <div className="text-center p-4 rounded-lg bg-amber-50 border border-amber-200"><p className="text-xs text-amber-600 font-medium">SGST Payable</p><p className="text-lg font-bold text-amber-700 mt-1 tabular-nums">{formatCurrency(gstr3bData?.sgstPayable || 0)}</p></div>
              <div className="text-center p-4 rounded-lg bg-teal-50 border border-teal-200"><p className="text-xs text-teal-600 font-medium">IGST Payable</p><p className="text-lg font-bold text-teal-700 mt-1 tabular-nums">{formatCurrency(gstr3bData?.igstPayable || 0)}</p></div>
            </div></CardContent></Card>
            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Quarterly Breakdown</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Month</TableHead><TableHead className="text-xs font-medium uppercase text-right">Tax</TableHead><TableHead className="text-xs font-medium uppercase text-right">Invoices</TableHead></TableRow></TableHeader><TableBody>{(gstr3bData?.quarterBreakdown || []).map((m, i) => (<TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-medium text-sm">{m.month}</TableCell><TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(m.tax)}</TableCell><TableCell className="text-right tabular-nums text-sm">{m.count}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
          </>)}
        </TabsContent>

        {/* ═══ GSTR-9 Annual Return ═══ */}
        <TabsContent value="gstr9" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">GSTR-9 Annual Return</h3>
              <p className="text-xs text-muted-foreground">Annual consolidated return for the financial year</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={gstr9Year} onValueChange={setGstr9Year}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(currentFy)}>{currentFy}-{currentFy + 1}</SelectItem>
                  <SelectItem value={String(currentFy - 1)}>{currentFy - 1}-{currentFy}</SelectItem>
                  <SelectItem value={String(currentFy - 2)}>{currentFy - 2}-{currentFy - 1}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => exportCsv("GSTR9_Annual_Return",
                ["Section", "Amount (INR)", "Count"],
                gstr9Data ? [
                  ["Total Outward Supply", gstr9Data.totalOutward, gstr9Data.totalInvoices],
                  ["Total CGST", gstr9Data.totalCgst, "-"],
                  ["Total SGST", gstr9Data.totalSgst, "-"],
                  ["Total IGST", gstr9Data.totalIgst, "-"],
                  ["Total Tax Payable", gstr9Data.totalTax, "-"],
                  ["Credit Notes", gstr9Data.creditNoteTotal, gstr9Data.creditNoteCount],
                  ["Net Tax Payable", gstr9Data.netTaxPayable, "-"],
                  ["TDS Deducted", gstr9Data.totalTds, "-"],
                  ["Reverse Charge", gstr9Data.reverseChargeTotal, gstr9Data.reverseChargeCount],
                ] : []
              )} disabled={gstr9Loading}><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
            </div>
          </div>

          {gstr9Loading ? <Skeleton className="skeleton-wave h-64" /> : gstr9Data && (<>
            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">FY {gstr9Data.financialYear} Summary</CardTitle></CardHeader><CardContent className="p-0">
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Section</TableHead><TableHead className="text-xs font-medium uppercase text-right">Amount (INR)</TableHead><TableHead className="text-xs font-medium uppercase text-right">Count</TableHead></TableRow></TableHeader><TableBody>
                <TableRow><TableCell className="font-medium text-sm">Total Outward Supply (Taxable)</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(gstr9Data.totalOutward)}</TableCell><TableCell className="text-right tabular-nums text-sm">{gstr9Data.totalInvoices}</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-sm">Total CGST Collected</TableCell><TableCell className="text-right tabular-nums text-sm text-green-700">{formatCurrency(gstr9Data.totalCgst)}</TableCell><TableCell className="text-right tabular-nums text-sm">-</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-sm">Total SGST Collected</TableCell><TableCell className="text-right tabular-nums text-sm text-amber-700">{formatCurrency(gstr9Data.totalSgst)}</TableCell><TableCell className="text-right tabular-nums text-sm">-</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-sm">Total IGST Collected</TableCell><TableCell className="text-right tabular-nums text-sm text-teal-700">{formatCurrency(gstr9Data.totalIgst)}</TableCell><TableCell className="text-right tabular-nums text-sm">-</TableCell></TableRow>
                <TableRow className="bg-muted/50"><TableCell className="font-bold text-sm">Total Tax Collected</TableCell><TableCell className="text-right tabular-nums text-sm font-bold">{formatCurrency(gstr9Data.totalTax)}</TableCell><TableCell className="text-right tabular-nums text-sm">-</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-sm">Credit Notes Adjusted</TableCell><TableCell className="text-right tabular-nums text-sm text-red-600">-{formatCurrency(gstr9Data.creditNoteTotal)}</TableCell><TableCell className="text-right tabular-nums text-sm">{gstr9Data.creditNoteCount}</TableCell></TableRow>
                <TableRow className="bg-green-50"><TableCell className="font-bold text-sm text-green-700">Net Tax Payable</TableCell><TableCell className="text-right tabular-nums text-sm font-bold text-green-700">{formatCurrency(gstr9Data.netTaxPayable)}</TableCell><TableCell className="text-right tabular-nums text-sm">-</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-sm">TDS Deducted on Invoices</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(gstr9Data.totalTds)}</TableCell><TableCell className="text-right tabular-nums text-sm">-</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-sm">Reverse Charge Invoices</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(gstr9Data.reverseChargeTotal)}</TableCell><TableCell className="text-right tabular-nums text-sm">{gstr9Data.reverseChargeCount}</TableCell></TableRow>
                {gstr9Data.compositeScheme && <TableRow className="bg-purple-50"><TableCell className="font-medium text-sm text-purple-700">Composite Scheme Rate</TableCell><TableCell className="text-right tabular-nums text-sm text-purple-700">{gstr9Data.compositeSchemeRate}%</TableCell><TableCell className="text-right tabular-nums text-sm">Applied</TableCell></TableRow>}
              </TableBody></Table></div>
            </CardContent></Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Monthly Breakdown</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto max-h-64 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs">Month</TableHead><TableHead className="text-xs text-right">Outward</TableHead><TableHead className="text-xs text-right">Tax</TableHead><TableHead className="text-xs text-right">IGST</TableHead><TableHead className="text-xs text-right">Count</TableHead></TableRow></TableHeader><TableBody>{gstr9Data.monthlyBreakdown.length === 0 ? (<TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No data</TableCell></TableRow>) : gstr9Data.monthlyBreakdown.map((m, i) => (<TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="text-sm">{m.month}</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(m.outward)}</TableCell><TableCell className="text-right tabular-nums text-sm font-medium">{formatCurrency(m.tax)}</TableCell><TableCell className="text-right tabular-nums text-sm text-teal-700">{formatCurrency(m.igst)}</TableCell><TableCell className="text-right tabular-nums text-sm">{m.count}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
              <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Quarterly Breakdown</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="text-xs">Quarter</TableHead><TableHead className="text-xs text-right">Tax</TableHead><TableHead className="text-xs text-right">Invoices</TableHead></TableRow></TableHeader><TableBody>{gstr9Data.quarterlyBreakdown.length === 0 ? (<TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-sm">No data</TableCell></TableRow>) : gstr9Data.quarterlyBreakdown.map((q, i) => (<TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-medium text-sm">{q.quarter}</TableCell><TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(q.tax)}</TableCell><TableCell className="text-right tabular-nums text-sm">{q.count}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
            </div>
          </>)}
        </TabsContent>

        {/* ═══ TDS/TCS Tracking ═══ */}
        <TabsContent value="tds" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Landmark className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Track TDS/TCS collected from payments and deposits</p>
            </div>
            <Dialog open={tdsDialogOpen} onOpenChange={setTdsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => setTdsForm({ type: "TDS", section: "194C", description: "", panNumber: "", baseAmount: "", tdsRate: "2", period: "", notes: "" })}><Plus className="h-4 w-4 mr-2" />Add Entry</Button>
              </DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>Add TDS/TCS Entry</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Type</Label><Select value={tdsForm.type} onValueChange={(v) => setTdsForm(f => ({ ...f, type: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TDS">TDS</SelectItem><SelectItem value="TCS">TCS</SelectItem></SelectContent></Select></div>
                    <div><Label>Section</Label><Select value={tdsForm.section} onValueChange={(v) => setTdsForm(f => ({ ...f, section: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="194C">194C - Contractors</SelectItem><SelectItem value="194J">194J - Professional Fees</SelectItem><SelectItem value="194H">194H - Rent</SelectItem><SelectItem value="194A">194A - Interest</SelectItem><SelectItem value="194I">194I - Rent (Immovable)</SelectItem><SelectItem value="206C">206C - TCS</SelectItem></SelectContent></Select></div>
                  </div>
                  <div><Label>Description</Label><Input value={tdsForm.description} onChange={(e) => setTdsForm(f => ({ ...f, description: e.target.value }))} placeholder="Payment to vendor / contractor" className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>PAN Number</Label><Input value={tdsForm.panNumber} onChange={(e) => setTdsForm(f => ({ ...f, panNumber: e.target.value }))} placeholder="ABCDE1234F" className="mt-1" /></div>
                    <div><Label>Period</Label><Input value={tdsForm.period} onChange={(e) => setTdsForm(f => ({ ...f, period: e.target.value }))} placeholder="Q1 2024-25" className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Base Amount (INR)</Label><Input type="number" value={tdsForm.baseAmount} onChange={(e) => setTdsForm(f => ({ ...f, baseAmount: e.target.value }))} placeholder="50000" className="mt-1" /></div>
                    <div><Label>TDS Rate (%)</Label><Input type="number" value={tdsForm.tdsRate} onChange={(e) => setTdsForm(f => ({ ...f, tdsRate: e.target.value }))} placeholder="2" className="mt-1" /></div>
                  </div>
                  {tdsForm.baseAmount && tdsForm.tdsRate && <p className="text-xs text-muted-foreground">TDS Amount: <span className="font-semibold">{formatCurrency(Number(tdsForm.baseAmount) * Number(tdsForm.tdsRate) / 100)}</span></p>}
                  <div><Label>Notes</Label><Textarea value={tdsForm.notes} onChange={(e) => setTdsForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="mt-1" rows={2} /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setTdsDialogOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => tdsMutation.mutate({ action: "create", ...tdsForm, baseAmount: Number(tdsForm.baseAmount), tdsRate: Number(tdsForm.tdsRate) })} disabled={!tdsForm.baseAmount || tdsMutation.isPending}>{tdsMutation.isPending ? "Saving..." : "Add Entry"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {tdsLoading ? <Skeleton className="skeleton-wave h-48" /> : tdsData && (<>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total TDS Deducted</p><p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(tdsData.summary.totalDeducted)}</p><p className="text-xs text-muted-foreground mt-1">This financial year</p></CardContent></Card>
              <Card className="border bg-green-50 border-green-200"><CardContent className="p-4"><p className="text-xs text-green-600">TDS Deposited</p><p className="text-xl font-bold mt-1 tabular-nums text-green-700">{formatCurrency(tdsData.summary.totalDeposited)}</p><p className="text-xs text-green-600 mt-1">Filed with government</p></CardContent></Card>
              <Card className="border bg-amber-50 border-amber-200"><CardContent className="p-4"><p className="text-xs text-amber-600">TDS Pending</p><p className="text-xl font-bold mt-1 tabular-nums text-amber-700">{formatCurrency(tdsData.summary.totalPending)}</p><p className="text-xs text-amber-600 mt-1">Yet to be deposited</p></CardContent></Card>
            </div>

            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">TDS Section Summary</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Section</TableHead><TableHead className="text-xs font-medium uppercase text-right">Entries</TableHead><TableHead className="text-xs font-medium uppercase text-right">Total Amount</TableHead><TableHead className="text-xs font-medium uppercase text-right">Deposited</TableHead><TableHead className="text-xs font-medium uppercase text-right">Pending</TableHead></TableRow></TableHeader><TableBody>
              {tdsData.sectionSummary.length === 0 ? (<TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No TDS entries yet</TableCell></TableRow>) : tdsData.sectionSummary.map((s, i) => (<TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-mono text-sm font-medium">{s.section}</TableCell><TableCell className="text-right tabular-nums text-sm">{s.count}</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(s.totalAmount)}</TableCell><TableCell className="text-right tabular-nums text-sm text-green-700">{formatCurrency(s.deposited)}</TableCell><TableCell className="text-right tabular-nums text-sm text-amber-600">{formatCurrency(s.totalAmount - s.deposited)}</TableCell></TableRow>))}
            </TableBody></Table></div></CardContent></Card>

            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">TDS/TCS Entries</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Type</TableHead><TableHead className="text-xs font-medium uppercase">Section</TableHead><TableHead className="text-xs font-medium uppercase">PAN</TableHead><TableHead className="text-xs font-medium uppercase text-right">Base Amt</TableHead><TableHead className="text-xs font-medium uppercase text-right">Rate</TableHead><TableHead className="text-xs font-medium uppercase text-right">TDS Amt</TableHead><TableHead className="text-xs font-medium uppercase">Status</TableHead><TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
              {tdsData.entries.length === 0 ? (<TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No entries</TableCell></TableRow>) : tdsData.entries.map((e) => (<TableRow key={e.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell><Badge variant="outline" className="text-[10px]">{e.type}</Badge></TableCell><TableCell className="font-mono text-xs">{e.section}</TableCell><TableCell className="font-mono text-xs">{e.panNumber || "-"}</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(e.baseAmount)}</TableCell><TableCell className="text-right tabular-nums text-sm">{e.tdsRate}%</TableCell><TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(e.tdsAmount)}</TableCell><TableCell><Badge variant="outline" className={`text-[10px] ${e.status === "DEPOSITED" ? "bg-green-100 text-green-700" : e.status === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700"}`}>{e.status}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteTdsMutation.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}
            </TableBody></Table></div></CardContent></Card>
          </>)}
        </TabsContent>

        {/* ═══ GST Audit ═══ */}
        <TabsContent value="audit" className="mt-6 space-y-4">
          {auditLoading ? <Skeleton className="skeleton-wave h-64" /> : auditData && (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Invoices</p><p className="text-xl font-bold mt-1 tabular-nums">{auditData.summary.totalInvoices}</p></CardContent></Card>
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Tax</p><p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(auditData.summary.totalTax)}</p></CardContent></Card>
              <Card className="border bg-green-50 border-green-200"><CardContent className="p-4"><p className="text-xs text-green-600">Verified</p><p className="text-xl font-bold mt-1 tabular-nums text-green-700">{auditData.summary.totalInvoices - auditData.summary.discrepancyCount}</p></CardContent></Card>
              <Card className="border bg-red-50 border-red-200"><CardContent className="p-4"><p className="text-xs text-red-600">Discrepancies</p><p className="text-xl font-bold mt-1 tabular-nums text-red-700">{auditData.summary.discrepancyCount}</p><p className="text-xs text-red-500 mt-1">{auditData.summary.discrepancyRate}% rate</p></CardContent></Card>
            </div>
            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Invoice-level GST Audit</CardTitle><CardDescription className="text-xs text-muted-foreground">Verify GST calculations per invoice for compliance</CardDescription></CardHeader><CardContent>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Invoice #</TableHead><TableHead className="text-xs font-medium uppercase">Subscriber</TableHead><TableHead className="text-xs font-medium uppercase text-right">Taxable Value</TableHead><TableHead className="text-xs font-medium uppercase text-right">Rate</TableHead><TableHead className="text-xs font-medium uppercase text-right">Actual Tax</TableHead><TableHead className="text-xs font-medium uppercase text-right">Expected</TableHead><TableHead className="text-xs font-medium uppercase text-right">Variance</TableHead><TableHead className="text-xs font-medium uppercase">RCM</TableHead><TableHead className="text-xs font-medium uppercase">Status</TableHead></TableRow></TableHeader><TableBody>
                {auditData.invoices.length === 0 ? (<TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No invoices to audit</TableCell></TableRow>) : auditData.invoices.map((inv) => {
                  const totalVariance = Math.round((inv.cgstVariance + inv.sgstVariance + inv.igstVariance) * 100) / 100;
                  return (<TableRow key={inv.id} className={`${inv.hasDiscrepancy ? "bg-red-50/50" : ""} hover:bg-muted/50 transition-colors duration-150`}><TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell><TableCell className="text-sm">{inv.subscriberName}</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(inv.taxableValue)}</TableCell><TableCell className="text-right tabular-nums text-sm">{inv.cgstRate + inv.sgstRate + inv.igstRate}%</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(inv.totalTax)}</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(inv.expectedCgst + inv.expectedSgst + inv.expectedIgst)}</TableCell><TableCell className="text-right tabular-nums text-sm">{totalVariance === 0 ? "-" : <span className="text-red-600 font-medium">{formatCurrency(totalVariance)}</span>}</TableCell><TableCell>{inv.reverseCharge ? <Badge variant="outline" className="bg-teal-100 text-teal-700 text-[10px]">RCM</Badge> : "-"}</TableCell><TableCell><Badge variant="outline" className={`text-[10px] ${inv.hasDiscrepancy ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"}`}>{inv.hasDiscrepancy ? "Mismatch" : "Verified"}</Badge></TableCell></TableRow>);
                })}
              </TableBody></Table></div>
            </CardContent></Card>
          </>)}
        </TabsContent>

        {/* ═══ Reverse Charge ═══ */}
        <TabsContent value="reverse" className="mt-6 space-y-4">
          <Card className="border shadow-sm bg-teal-50 border-teal-200"><CardContent className="p-4 flex items-center gap-3">
            <Info className="h-5 w-5 text-teal-600" />
            <div><p className="text-sm font-medium text-teal-700">Reverse Charge Mechanism (RCM)</p><p className="text-xs text-teal-600 mt-0.5">Under RCM, the recipient (not supplier) pays GST on notified services. Mark invoices as reverse charge when applicable.</p></div>
          </CardContent></Card>

          {rcLoading ? <Skeleton className="skeleton-wave h-64" /> : rcData && (<>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">RCM Invoices</p><p className="text-xl font-bold mt-1 tabular-nums">{rcData.totalInvoices}</p></CardContent></Card>
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Value</p><p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(rcData.totalValue)}</p></CardContent></Card>
              <Card className="border bg-teal-50 border-teal-200"><CardContent className="p-4"><p className="text-xs text-teal-600">Total RCM Tax</p><p className="text-xl font-bold mt-1 tabular-nums text-teal-700">{formatCurrency(rcData.totalTax)}</p></CardContent></Card>
            </div>

            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Reverse Charge Invoices</CardTitle></CardHeader><CardContent>
              {rcData.invoices.length === 0 ? (<div className="flex flex-col items-center justify-center py-12"><Shield className="h-12 w-12 text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">No reverse charge invoices found</p><p className="text-xs text-muted-foreground mt-1">Mark invoices as RCM from the invoice management page</p></div>) : (<div className="overflow-x-auto max-h-96 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Invoice #</TableHead><TableHead className="text-xs font-medium uppercase">Subscriber</TableHead><TableHead className="text-xs font-medium uppercase">GSTIN</TableHead><TableHead className="text-xs font-medium uppercase text-right">Value</TableHead><TableHead className="text-xs font-medium uppercase text-right">Tax</TableHead><TableHead className="text-xs font-medium uppercase">Status</TableHead></TableRow></TableHeader><TableBody>{rcData.invoices.map((inv) => (<TableRow key={inv.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell><TableCell className="text-sm">{inv.subscriberName}</TableCell><TableCell className="font-mono text-xs">{inv.subscriberGstin || "-"}</TableCell><TableCell className="text-right tabular-nums text-sm">{formatCurrency(inv.invoiceValue)}</TableCell><TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(inv.totalTax)}</TableCell><TableCell><Badge variant="outline" className="text-[10px] bg-teal-100 text-teal-700">{inv.status}</Badge></TableCell></TableRow>))}</TableBody></Table></div>)}
            </CardContent></Card>
          </>)}
        </TabsContent>

        {/* ═══ Composite Scheme ═══ */}
        <TabsContent value="composite" className="mt-6 space-y-4">
          {compositeLoading ? <Skeleton className="skeleton-wave h-64" /> : compositeData && (<>
            <Card className="border shadow-sm bg-purple-50 border-purple-200"><CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-purple-600" />
              <div><p className="text-sm font-medium text-purple-700">GST Composition Scheme</p><p className="text-xs text-purple-600 mt-0.5">Taxpayers under composition scheme pay fixed tax rates and cannot collect input tax credit. Interstate supplies and services above threshold are not eligible.</p></div>
            </CardContent></Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Scheme Status</p><p className="text-lg font-bold mt-1">{compositeData.compositeScheme ? <span className="text-green-700">Enrolled</span> : <span className="text-muted-foreground">Not Enrolled</span>}</p><Button variant="outline" size="sm" className="mt-2 w-full text-xs" onClick={() => compositeMutation.mutate({ compositeScheme: !compositeData.compositeScheme, compositeSchemeRate: compositeData.compositeSchemeRate })} disabled={compositeMutation.isPending}>{compositeMutation.isPending ? "..." : compositeData.compositeScheme ? "Opt Out" : "Enroll Now"}</Button></CardContent></Card>
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Applicable Rate</p><p className="text-lg font-bold mt-1">{compositeData.compositeSchemeRate}%</p><p className="text-xs text-muted-foreground mt-1">For ISP services</p></CardContent></Card>
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Turnover This FY</p><p className="text-lg font-bold mt-1">{formatCurrency(compositeData.currentTurnover)}</p><p className={`text-xs mt-1 ${compositeData.isEligible ? "text-green-600" : "text-red-600"}`}>{compositeData.isEligible ? "Within limit" : "Exceeds limit"}</p></CardContent></Card>
              <Card className="border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">ITC Eligibility</p><p className="text-lg font-bold mt-1 text-red-600">Not Available</p><p className="text-xs text-muted-foreground mt-1">Under composite scheme</p></CardContent></Card>
            </div>

            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Scheme Details & Rules</CardTitle></CardHeader><CardContent className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div><p className="text-sm font-medium">GSTIN: {compositeData.gstin || "Not set"}</p><p className="text-xs text-muted-foreground">{compositeData.companyName || "Company Name"}</p></div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border"><p className="text-xs text-muted-foreground">Turnover Limit</p><p className="text-sm font-semibold mt-1">{formatCurrency(compositeData.turnoverLimit)}</p></div>
                <div className="p-3 rounded-lg border"><p className="text-xs text-muted-foreground">Remaining Eligible</p><p className="text-sm font-semibold mt-1 text-green-700">{formatCurrency(Math.max(0, compositeData.turnoverLimit - compositeData.currentTurnover))}</p></div>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium">Composition Scheme Rules:</p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Cannot supply goods/services outside the state (interstate)</li>
                  <li>Cannot collect Input Tax Credit (ITC)</li>
                  <li>Must file quarterly return (GSTR-4)</li>
                  <li>Cannot collect tax from customers separately (tax included in price)</li>
                  <li>Eligible if turnover is below {formatCurrency(compositeData.turnoverLimit)} in previous FY</li>
                </ul>
              </div>
            </CardContent></Card>
          </>)}
        </TabsContent>

        {/* ═══ HSN/SAC ═══ */}
        <TabsContent value="hsn" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">HSN/SAC codes used in invoices</p>
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-teal-50 border border-teal-200">
                <Info className="h-3.5 w-3.5 text-teal-600" />
                <span className="text-[10px] text-teal-700">Multi-rate: Different rates for different service categories</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportHsnCsv} disabled={hsnLoading}><Download className="h-4 w-4 mr-2" />Export HSN CSV</Button>
              <Dialog open={hsnDialogOpen} onOpenChange={setHsnDialogOpen}><DialogTrigger asChild><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { setEditingHsn(null); setHsnForm({ code: "", description: "", taxRate: "18" }); }}><Plus className="h-4 w-4 mr-2" />Add HSN/SAC</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>{editingHsn ? "Edit" : "Add"} HSN/SAC Code</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><div><Label>HSN/SAC Code</Label><Input value={hsnForm.code} onChange={(e) => setHsnForm({ ...hsnForm, code: e.target.value })} placeholder="998311" className="mt-1" /></div><div><Label>Description</Label><Input value={hsnForm.description} onChange={(e) => setHsnForm({ ...hsnForm, description: e.target.value })} placeholder="Internet broadband services" className="mt-1" /></div><div><Label>Tax Rate (%)</Label><Input type="number" value={hsnForm.taxRate} onChange={(e) => setHsnForm({ ...hsnForm, taxRate: e.target.value })} className="mt-1" /></div></div><DialogFooter><Button variant="outline" onClick={() => { setHsnDialogOpen(false); setEditingHsn(null); }}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={saveHsn} disabled={!hsnForm.code || !hsnForm.description || hsnMutation.isPending}>{hsnMutation.isPending ? "Saving..." : editingHsn ? "Update" : "Add Code"}</Button></DialogFooter></DialogContent>
              </Dialog>
            </div>
          </div>
          <Card className="border shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto">{hsnLoading ? (<div className="p-8 flex items-center justify-center"><Skeleton className="skeleton-wave h-8 w-48" /></div>) : (<Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Code</TableHead><TableHead className="text-xs font-medium uppercase">Description</TableHead><TableHead className="text-xs font-medium uppercase">Tax Rate</TableHead><TableHead className="text-xs font-medium uppercase text-right">Invoices</TableHead><TableHead className="text-xs font-medium uppercase text-right">Total Value</TableHead><TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{(!hsnData?.hsnCodes || hsnData.hsnCodes.length === 0) ? (<TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No HSN/SAC codes found</TableCell></TableRow>) : hsnData.hsnCodes.map((h, i) => (<TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="font-mono text-sm font-medium">{h.code}</TableCell><TableCell className="text-sm max-w-xs">{h.description}</TableCell><TableCell><Badge variant="outline" className="text-green-600">{h.taxRate}%</Badge></TableCell><TableCell className="text-right tabular-nums text-sm">{h.totalInvoices}</TableCell><TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(h.totalValue)}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditHsn(h)}><Edit2 className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteHsnCode(h.code)}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell></TableRow>))}</TableBody></Table>)}</div></CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Delete HSN Confirmation */}
      <AlertDialog open={!!deleteHsnCode} onOpenChange={() => setDeleteHsnCode(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete HSN/SAC Code</AlertDialogTitle><AlertDialogDescription>Delete <code className="font-mono font-bold">{deleteHsnCode}</code>? This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { if (deleteHsnCode) deleteHsnMutation.mutate(deleteHsnCode); }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
