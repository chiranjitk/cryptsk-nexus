"use client";

import React, { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Search, Plus, Send, Printer, Eye, Trash2,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, CheckCircle2, Edit2, Ban,
  CreditCard, Download, FileSpreadsheet, X, Users, CalendarClock, RefreshCw,
  Minus, Copy, FileMinus, Receipt, Hash,
  AlertTriangle, Inbox, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Helpers ────────────────────────────────────────────
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  DRAFT: { label: "Draft", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-full px-2.5 py-0.5", dot: "bg-blue-500" },
  SENT: { label: "Sent", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-full px-2.5 py-0.5", dot: "bg-amber-500" },
  PAID: { label: "Paid", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full px-2.5 py-0.5", dot: "bg-emerald-500" },
  PARTIALLY_PAID: { label: "Partially Paid", cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 rounded-full px-2.5 py-0.5", dot: "bg-yellow-500" },
  OVERDUE: { label: "Overdue", cls: "bg-red-500/10 text-red-700 dark:text-red-400 rounded-full px-2.5 py-0.5", dot: "bg-red-500" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-full px-2.5 py-0.5", dot: "bg-slate-400" },
  CREDIT_NOTE: { label: "Credit Note", cls: "bg-purple-500/10 text-purple-700 dark:text-purple-400 rounded-full px-2.5 py-0.5", dot: "bg-purple-500" },
};

function StatusBadge({ status, className }: { status: string; className?: string }) {
  const badge = STATUS_BADGE[status];
  if (!badge) return <span className={className}>{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full text-xs font-medium ${badge.cls} ${className || ""}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", ONLINE: "Online",
  BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque", WALLET: "Wallet",
};

// ─── Types ──────────────────────────────────────────────
interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  subscriber: { id: string; name: string; code: string; phone: string; area: { id: string; name: string } | null };
  plan: { id: string; name: string } | null;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  discountAmount: number;
  lateFee: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  paidAt: string | null;
  isProRata: boolean;
  proRataDays: number;
  payments: { id: string; amount: number; status: string; paymentMode: string; createdAt: string }[];
  lineItems: { id: string; description: string; quantity: number; rate: number; amount: number }[];
  createdAt: string;
}

interface InvoiceDetail extends Omit<InvoiceItem, "payments" | "lineItems"> {
  description: string;
  notes: string;
  totalAmount: number;
  discountType: string | null;
  discountValue: number;
  advanceAdjustment: number;
  receiptNumber: string;
  paymentMode: string | null;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  reverseCharge?: boolean;
  subscriber: InvoiceItem["subscriber"] & { email: string; address: string; gstin: string; panNumber: string };
  plan: InvoiceItem["plan"] & { downloadSpeed: number; uploadSpeed: number; speedUnit: string; validityDays: number; priceMonthly: number } | null;
  payments: { id: string; amount: number; status: string; paymentMode: string; createdAt: string; collectedBy: { name: string } | null; verifiedBy: { name: string } | null; transactionRef: string; notes: string }[];
  lineItems: { id: string; description: string; quantity: number; rate: number; amount: number }[];
}

interface SubOption { id: string; name: string; code: string }
interface AreaOption { id: string; name: string }
interface PlanOption { id: string; name: string; priceMonthly: number }
interface LineItemForm { description: string; quantity: number; rate: number; amount: number }

interface RecurringTemplate {
  id: string;
  name: string;
  schedule: string;
  status: string;
  nextGenerateAt: string | null;
  lastGeneratedAt: string | null;
  subscriber: { id: string; name: string; code: string } | null;
  plan: { id: string; name: string } | null;
  area: { id: string; name: string } | null;
}

interface CreditNoteItem {
  id: string;
  amount: number;
  reason: string;
  status: string;
  createdBy: string | null;
  createdAt: string;
  creator?: { name: string } | null;
}

const CN_REASON_OPTIONS = [
  { value: "Error", label: "Error" },
  { value: "Return", label: "Return" },
  { value: "Discount", label: "Discount" },
  { value: "Cancellation", label: "Cancellation" },
  { value: "Other", label: "Other" },
];

const emptyEditForm = {
  description: "", discountType: "", discountValue: "", discountAmount: "", lateFee: "", notes: "",
  cgstRate: "", sgstRate: "", igstRate: "", reverseCharge: false,
};

const defaultLineItem = (): LineItemForm => ({ description: "", quantity: 1, rate: 0, amount: 0 });

// ─── Sort Header Component ─────────────────────────────
function SortableHead({ label, field, sortBy, sortOrder, onSort, className, align }: {
  label: string; field: string; sortBy: string; sortOrder: string; onSort: (f: string) => void;
  className?: string; align?: "left" | "right";
}) {
  return (
    <TableHead
      className={`font-semibold text-xs uppercase tracking-wider cursor-pointer select-none hover:bg-muted/50 transition-colors ${className || ""}`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        <span>{label}</span>
        {sortBy === field && (
          sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        )}
      </div>
    </TableHead>
  );
}

// ─── Credit Notes List Sub-component ─────────────────
function CreditNoteCountBadge({ invoiceId }: { invoiceId: string }) {
  const { data } = useQuery({
    queryKey: ["invoice-credit-notes-count", invoiceId],
    queryFn: () => apiFetch<{ creditNotes: CreditNoteItem[] }>(`/api/invoices/${invoiceId}/credit-note`),
    enabled: !!invoiceId,
    staleTime: 10_000,
  });
  const count = data?.creditNotes?.length || 0;
  if (count === 0) return null;
  return (
    <Badge variant="secondary" className="text-[10px] ml-1 bg-purple-100 text-purple-700 border-purple-200 h-5 px-1.5">
      {count}
    </Badge>
  );
}

function CreditNotesList({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["invoice-credit-notes", invoiceId],
    queryFn: () => apiFetch<{ creditNotes: CreditNoteItem[] }>(`/api/invoices/${invoiceId}/credit-note`),
    enabled: !!invoiceId,
  });

  if (isLoading) return <Skeleton className="skeleton-wave h-12 w-full" />;

  const notes = data?.creditNotes || [];
  if (notes.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No credit notes yet</p>;
  }

  const cnStatus = (status: string) => {
    if (status === "APPLIED") return "bg-green-100 text-green-700 border-green-200";
    if (status === "DRAFT") return "bg-yellow-100 text-yellow-700 border-yellow-200";
    if (status === "VOID") return "bg-gray-100 text-gray-500 border-gray-200";
    return "bg-gray-100 text-gray-500";
  };

  return (
    <div className="space-y-2">
      {notes.map((cn) => (
        <div key={cn.id} className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/30">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-purple-700">{formatINR(cn.amount)}</p>
            <p className="text-[11px] text-muted-foreground truncate">{cn.reason}</p>
            {cn.creator && <p className="text-[10px] text-muted-foreground">by {cn.creator.name}</p>}
          </div>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${cnStatus(cn.status)}`}>
            {cn.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ─── Create Invoice Dialog ─────────────────────────────
function CreateInvoiceDialog({ open, onClose, onSubmit, isSubmitting, subscribers }: {
  open: boolean; onClose: () => void; onSubmit: (v: Record<string, string>) => void;
  isSubmitting: boolean; subscribers: SubOption[];
}) {
  const [subId, setSubId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [lateFee, setLateFee] = useState("0");
  const [isProRata, setIsProRata] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemForm[]>([defaultLineItem()]);
  const [cgstRate, setCgstRate] = useState("");
  const [sgstRate, setSgstRate] = useState("");
  const [igstRate, setIgstRate] = useState("");

  const handleSubmit = () => {
    if (!subId) { toast.error("Select a subscriber"); return; }
    onSubmit({
      subscriberId: subId, issueDate, dueDate, periodStart, periodEnd,
      description, notes, discountType, discountValue, lateFee,
      isProRata: isProRata ? "true" : "false",
      lineItems: JSON.stringify(lineItems),
      cgstRate, sgstRate, igstRate,
    });
  };

  const addLineItem = () => setLineItems([...lineItems, defaultLineItem()]);
  const removeLineItem = (idx: number) => setLineItems(lineItems.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: keyof LineItemForm, value: string | number) => {
    const updated = [...lineItems];
    (updated[idx] as unknown as Record<string, unknown>)[field] = value;
    if (field === "quantity" || field === "rate") {
      updated[idx].amount = (updated[idx].quantity || 1) * (updated[idx].rate || 0);
    }
    setLineItems(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-red-600" />Generate Invoice</DialogTitle>
          <DialogDescription>Create a new invoice for a subscriber</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Subscriber *</Label>
              <Select value={subId} onValueChange={setSubId}>
                <SelectTrigger><SelectValue placeholder="Select subscriber" /></SelectTrigger>
                <SelectContent>
                  <div className="max-h-60 overflow-y-auto">
                    {subscribers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Issue Date *</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Due Date *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Period Start *</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Period End *</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="proRata" checked={isProRata} onCheckedChange={(v) => setIsProRata(!!v)} />
            <Label htmlFor="proRata" className="text-xs">Pro-rata billing (mid-cycle activation)</Label>
          </div>

          <div>
            <Label className="text-xs font-semibold">Line Items</Label>
            <div className="rounded-lg border mt-1.5 divide-y">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center p-2 bg-muted/20">
                  <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0 text-center">{idx + 1}</span>
                  <div className="flex-1">
                    <Input placeholder="Description" value={item.description} onChange={(e) => updateLineItem(idx, "description", e.target.value)} className="h-8 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 p-0" />
                  </div>
                  <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateLineItem(idx, "quantity", parseInt(e.target.value) || 0)} className="w-14 h-8 text-xs text-center border-0 bg-transparent shadow-none focus-visible:ring-1 tabular-nums" min={1} />
                  <Input type="number" placeholder="Rate" value={item.rate} onChange={(e) => updateLineItem(idx, "rate", parseFloat(e.target.value) || 0)} className="w-20 h-8 text-xs text-right border-0 bg-transparent shadow-none focus-visible:ring-1 tabular-nums" min={0} />
                  <div className="w-20 text-xs font-semibold text-right tabular-nums text-muted-foreground">{formatINR(item.amount)}</div>
                  {lineItems.length > 1 && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0" onClick={() => removeLineItem(idx)}><Minus className="h-3 w-3" /></Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addLineItem} className="w-full h-8 mt-1.5 text-xs border-dashed hover:border-solid"><Plus className="h-3 w-3 mr-1" />Add Line Item</Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger><SelectValue placeholder="Discount" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Discount</SelectItem>
                <SelectItem value="PERCENTAGE">Percentage %</SelectItem>
                <SelectItem value="FLAT">Flat Amount</SelectItem>
              </SelectContent>
            </Select>
            {discountType && discountType !== "none" && (
              <Input placeholder={discountType === "PERCENTAGE" ? "%" : "₹"} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            )}
            <Input placeholder="Late Fee (₹)" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Tax Rate Overrides (0 = use plan default)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-[10px] text-green-700">CGST %</Label><Input type="number" step="0.01" min="0" max="100" value={cgstRate} onChange={(e) => setCgstRate(e.target.value)} className="h-8 text-xs" placeholder="9" /></div>
              <div className="space-y-1"><Label className="text-[10px] text-amber-700">SGST %</Label><Input type="number" step="0.01" min="0" max="100" value={sgstRate} onChange={(e) => setSgstRate(e.target.value)} className="h-8 text-xs" placeholder="9" /></div>
              <div className="space-y-1"><Label className="text-[10px] text-slate-700">IGST %</Label><Input type="number" step="0.01" min="0" max="100" value={igstRate} onChange={(e) => setIgstRate(e.target.value)} className="h-8 text-xs" placeholder="0" /></div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Input placeholder="Invoice description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea placeholder="Internal notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700 text-white">
            {isSubmitting ? "Creating..." : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Generate Dialog ────────────────────────────────
function BulkGenerateDialog({ open, onClose, areas, plans }: {
  open: boolean; onClose: () => void; areas: AreaOption[]; plans: PlanOption[];
}) {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState("ALL_ACTIVE");
  const [areaId, setAreaId] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));

  const bulkMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/invoices/bulk-generate", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Generated ${res.created} invoices`);
      onClose();
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: () => toast.error("Bulk generation failed"),
  });

  const handleGenerate = () => {
    bulkMutation.mutate({ filterType, areaId: areaId || undefined, planId: planId || undefined, status, issueDate, dueDate });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5 text-red-600" />Bulk Generate Invoices</DialogTitle>
          <DialogDescription>Create invoices for multiple subscribers at once</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Filter By</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_ACTIVE">All Active Subscribers</SelectItem>
                <SelectItem value="BY_AREA">By Area</SelectItem>
                <SelectItem value="BY_PLAN">By Plan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filterType === "BY_AREA" && (
            <div>
              <Label className="text-xs">Area</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {filterType === "BY_PLAN" && (
            <div>
              <Label className="text-xs">Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({formatINR(p.priceMonthly)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Invoice Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Issue Date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={bulkMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
            {bulkMutation.isPending ? "Generating..." : "Generate Invoices"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recurring Templates Dialog ─────────────────────────
function RecurringTemplatesDialog({ open, onClose, subscribers, areas, plans }: {
  open: boolean; onClose: () => void; subscribers: SubOption[]; areas: AreaOption[]; plans: PlanOption[];
}) {
  const queryClient = useQueryClient();
  const { data: templatesData } = useQuery({
    queryKey: ["recurring-templates"],
    queryFn: () => apiFetch<{ templates: RecurringTemplate[] }>("/api/invoices/recurring-templates"),
    enabled: open,
  });

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSubId, setFormSubId] = useState("");
  const [formPlanId, setFormPlanId] = useState("");
  const [formAreaId, setFormAreaId] = useState("");
  const [formSchedule, setFormSchedule] = useState("MONTHLY");
  const [formNotes, setFormNotes] = useState("");

  const createMut = useMutation({
    mutationFn: (body: Record<string, string>) => apiFetch("/api/invoices/recurring-templates", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("Template created");
      setShowForm(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["recurring-templates"] });
    },
    onError: () => toast.error("Failed to create template"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/invoices/recurring-templates?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["recurring-templates"] });
    },
    onError: () => toast.error("Failed to delete template"),
  });

  const resetForm = () => {
    setFormName(""); setFormSubId(""); setFormPlanId(""); setFormAreaId("");
    setFormSchedule("MONTHLY"); setFormNotes("");
  };

  const templates = templatesData?.templates || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-red-600" />Recurring Invoice Templates</DialogTitle>
          <DialogDescription>Set up automatic invoice generation schedules</DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No recurring templates configured</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Schedule</TableHead>
                  <TableHead className="text-xs">Scope</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Next</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs font-medium">{t.name}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{t.schedule}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {t.subscriber ? t.subscriber.name : t.area ? t.area.name : t.plan ? t.plan.name : "All"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${t.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{t.nextGenerateAt ? formatDate(t.nextGenerateAt) : "N/A"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-7 text-red-500" onClick={() => deleteMut.mutate(t.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Button onClick={() => setShowForm(true)} className="w-full bg-red-600 hover:bg-red-700 text-white">
              <Plus className="h-4 w-4 mr-2" />Add Template
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Template Name *</Label>
              <Input placeholder="e.g., Monthly - Area A" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Schedule</Label>
                <Select value={formSchedule} onValueChange={setFormSchedule}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Subscriber (optional)</Label>
                <Select value={formSubId || "_none"} onValueChange={(v) => setFormSubId(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <div className="max-h-40 overflow-y-auto">
                      <SelectItem value="_none">Any Subscriber</SelectItem>
                      {subscribers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}
                    </div>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Area (optional)</Label>
                <Select value={formAreaId || "_none"} onValueChange={(v) => setFormAreaId(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Any Area</SelectItem>
                    {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Plan (optional)</Label>
                <Select value={formPlanId || "_none"} onValueChange={(v) => setFormPlanId(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Any Plan</SelectItem>
                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              <Button onClick={() => createMut.mutate({ name: formName, subscriberId: formSubId, planId: formPlanId, areaId: formAreaId, schedule: formSchedule, notes: formNotes })} disabled={createMut.isPending || !formName} className="bg-red-600 hover:bg-red-700 text-white">
                {createMut.isPending ? "Saving..." : "Create Template"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Tax Settings Dialog ─────────────────────────────
function TaxSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["tax-settings"],
    queryFn: () => apiFetch<{ success: boolean; settings: Record<string, unknown> }>("/api/settings/tax"),
    enabled: open,
  });

  const [taxType, setTaxType] = useState("INTRA_STATE");
  const [cgst, setCgst] = useState("9");
  const [sgst, setSgst] = useState("9");
  const [igst, setIgst] = useState("18");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [compositeScheme, setCompositeScheme] = useState(false);
  const [compositeRate, setCompositeRate] = useState("6");
  const [hsnInput, setHsnInput] = useState("");

  // Populate from server data
  React.useEffect(() => {
    const s = settingsData?.settings;
    if (s) {
      setTaxType((s.taxType as string) || "INTRA_STATE");
      setCgst(String(s.defaultCgstRate ?? 9));
      setSgst(String(s.defaultSgstRate ?? 9));
      setIgst(String(s.defaultIgstRate ?? 18));
      setTaxInclusive(!!s.taxInclusive);
      setCompositeScheme(!!s.compositeScheme);
      setCompositeRate(String(s.compositeSchemeRate ?? 6));
      try {
        const parsed = JSON.parse((s.hsnCodes as string) || "[]");
        setHsnInput(Array.isArray(parsed) ? parsed.map((c: Record<string, string>) => `${c.code}:${c.description}`).join("\n") : "");
      } catch {
        setHsnInput("");
      }
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/settings/tax", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("Tax settings saved");
      queryClient.invalidateQueries({ queryKey: ["tax-settings"] });
      onClose();
    },
    onError: () => toast.error("Failed to save tax settings"),
  });

  const handleSave = () => {
    const hsnLines = hsnInput.trim().split("\n").filter((l) => l.trim());
    const hsnCodes = hsnLines.map((line) => {
      const [code, ...rest] = line.split(":");
      return { code: (code || "").trim(), description: rest.join(":").trim() };
    });
    saveMutation.mutate({
      taxType,
      defaultCgstRate: parseFloat(cgst) || 0,
      defaultSgstRate: parseFloat(sgst) || 0,
      defaultIgstRate: parseFloat(igst) || 0,
      taxInclusive,
      compositeScheme,
      compositeSchemeRate: parseFloat(compositeRate) || 0,
      hsnCodes: JSON.stringify(hsnCodes),
    });
  };

  const isInterState = taxType === "INTER_STATE";
  const totalRate = isInterState
    ? (parseFloat(igst) || 0)
    : (parseFloat(cgst) || 0) + (parseFloat(sgst) || 0);

  if (isLoading) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-red-600" />Tax Settings</DialogTitle>
          <DialogDescription>Configure default tax rates for invoice generation</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Tax Type Toggle */}
          <div>
            <Label className="text-xs font-semibold">Tax Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-sm text-center transition-colors ${!isInterState ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30" : "border-muted hover:border-muted-foreground"}`}
                onClick={() => setTaxType("INTRA_STATE")}
              >
                <p className="font-medium">Intra-State</p>
                <p className="text-[11px] mt-0.5 opacity-70">CGST + SGST</p>
              </button>
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-sm text-center transition-colors ${isInterState ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/30" : "border-muted hover:border-muted-foreground"}`}
                onClick={() => setTaxType("INTER_STATE")}
              >
                <p className="font-medium">Inter-State</p>
                <p className="text-[11px] mt-0.5 opacity-70">IGST only</p>
              </button>
            </div>
          </div>

          {/* Tax Rates */}
          {!isInterState ? (
            <div>
              <Label className="text-xs font-semibold">Tax Rates (Intra-State)</Label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <div className="space-y-1">
                  <Label className="text-[10px] text-green-700">CGST Rate (%)</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={cgst} onChange={(e) => setCgst(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-amber-700">SGST Rate (%)</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={sgst} onChange={(e) => setSgst(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs font-semibold">Tax Rate (Inter-State)</Label>
              <div className="mt-1.5">
                <Label className="text-[10px] text-slate-700">IGST Rate (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={igst} onChange={(e) => setIgst(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          )}

          {/* Summary Badge */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Effective Tax Rate</span>
              <Badge variant="outline" className={totalRate > 0 ? "bg-green-100 text-green-700 border-green-200" : ""}>
                {totalRate}%
              </Badge>
            </div>
          </div>

          {/* Tax Inclusive Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">Tax-Inclusive Pricing</Label>
              <p className="text-[11px] text-muted-foreground">Prices already include tax</p>
            </div>
            <Checkbox checked={taxInclusive} onCheckedChange={(v) => setTaxInclusive(!!v)} />
          </div>

          {/* Composite Scheme */}
          <div className="p-3 rounded-lg border bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">GST Composition Scheme</Label>
                <p className="text-[11px] text-muted-foreground">For businesses with turnover under ₹1.5 Cr</p>
              </div>
              <Checkbox checked={compositeScheme} onCheckedChange={(v) => setCompositeScheme(!!v)} />
            </div>
            {compositeScheme && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Composite Rate (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={compositeRate} onChange={(e) => setCompositeRate(e.target.value)} className="h-8 text-xs" />
              </div>
            )}
          </div>

          {/* HSN/SAC Codes */}
          <div>
            <Label className="text-xs font-semibold">HSN/SAC Codes</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">One per line: CODE: Description (e.g., 998312: Internet Services)</p>
            <Textarea
              value={hsnInput}
              onChange={(e) => setHsnInput(e.target.value)}
              rows={4}
              placeholder="998312: Internet Services&#10;998313: Leased Line Services"
              className="mt-1.5 text-xs font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
            {saveMutation.isPending ? "Saving..." : "Save Tax Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice Number Format Dialog ──────────────────────────
function InvoiceFormatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: formatData, isLoading } = useQuery({
    queryKey: ["invoice-format"],
    queryFn: () => apiFetch<{ success: boolean; settings: Record<string, unknown>; preview: string; currentCount: number }>("/api/settings/invoice-format"),
    enabled: open,
  });

  const [prefix, setPrefix] = useState("INV");
  const [separator, setSeparator] = useState("-");
  const [padding, setPadding] = useState("4");
  const [startNumber, setStartNumber] = useState("1001");
  const [autoReset, setAutoReset] = useState("NEVER");

  React.useEffect(() => {
    const s = formatData?.settings;
    if (s) {
      setPrefix((s.invoicePrefix as string) || "INV");
      setSeparator((s.invoiceSeparator as string) || "-");
      setPadding(String(s.invoiceNumberPadding ?? 4));
      setStartNumber(String(s.invoiceStartNumber ?? 1001));
      setAutoReset((s.invoiceAutoReset as string) || "NEVER");
    }
  }, [formatData]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/settings/invoice-format", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("Invoice format saved");
      queryClient.invalidateQueries({ queryKey: ["invoice-format"] });
      onClose();
    },
    onError: () => toast.error("Failed to save invoice format"),
  });

  // Live preview
  const previewNumber = (() => {
    const pad = parseInt(padding) || 4;
    const start = parseInt(startNumber) || 1001;
    const num = String(start + 1).padStart(pad, "0");
    const now = new Date();
    let suffix = "";
    if (autoReset === "YEARLY") {
      suffix = separator + String(now.getFullYear());
    } else if (autoReset === "MONTHLY") {
      suffix = separator + String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, "0");
    }
    return prefix + separator + num + suffix;
  })();

  const handleSave = () => {
    saveMutation.mutate({
      invoicePrefix: prefix,
      invoiceSeparator: separator,
      invoiceNumberPadding: parseInt(padding) || 4,
      invoiceStartNumber: parseInt(startNumber) || 1001,
      invoiceAutoReset: autoReset,
    });
  };

  if (isLoading) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Hash className="h-5 w-5 text-red-600" />Invoice Number Format</DialogTitle>
          <DialogDescription>Configure how invoice numbers are generated</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Live Preview */}
          <div className="p-4 rounded-lg bg-muted/50 border-2 border-dashed text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Preview</p>
            <p className="text-xl font-mono font-bold tracking-wider text-foreground">{previewNumber}</p>
          </div>

          {/* Format Configuration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Prefix</Label>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="INV" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Separator</Label>
              <Input value={separator} onChange={(e) => setSeparator(e.target.value)} placeholder="-" className="h-8 text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Padding Digits</Label>
              <Select value={padding} onValueChange={setPadding}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} digits (e.g., {String(1001).padStart(n, "0")})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start Number</Label>
              <Input type="number" value={startNumber} onChange={(e) => setStartNumber(e.target.value)} min={1} className="h-8 text-xs" />
            </div>
          </div>

          {/* Auto Reset */}
          <div>
            <Label className="text-xs font-semibold">Auto-Reset Sequence</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">Reset numbering to start number at defined intervals</p>
            <div className="grid grid-cols-3 gap-2">
              {(["NEVER", "YEARLY", "MONTHLY"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`p-2.5 rounded-lg border-2 text-xs text-center transition-colors ${autoReset === option ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30" : "border-muted hover:border-muted-foreground"}`}
                  onClick={() => setAutoReset(option)}
                >
                  {option === "NEVER" ? "Never" : option === "YEARLY" ? "Yearly" : "Monthly"}
                </button>
              ))}
            </div>
            {autoReset !== "NEVER" && (
              <p className="text-[11px] text-muted-foreground mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
                With {autoReset.toLowerCase()} reset, numbers will include: {autoReset === "YEARLY" ? "-2026" : "-202604"} suffix
              </p>
            )}
          </div>

          {/* Current Stats */}
          {formatData && (
            <div className="text-[11px] text-muted-foreground flex justify-between">
              <span>Total invoices: {formatData.currentCount}</span>
              <span>Server preview: {formatData.preview}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
            {saveMutation.isPending ? "Saving..." : "Save Format"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ─────────────────────────────────────
export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [subscriberFilter, setSubscriberFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [subSearch, setSubSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");

  // Dialog states
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | InvoiceItem | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBulkGenerate, setShowBulkGenerate] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showCreditNote, setShowCreditNote] = useState(false);
  const [showTaxSettings, setShowTaxSettings] = useState(false);
  const [showInvoiceFormat, setShowInvoiceFormat] = useState(false);

  // Credit note form states
  const [creditNoteAmount, setCreditNoteAmount] = useState("");
  const [creditNoteReason, setCreditNoteReason] = useState("");
  const [creditNoteNotes, setCreditNoteNotes] = useState("");
  const [creditNoteAutoApply, setCreditNoteAutoApply] = useState(true);

  // Form states
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editLineItems, setEditLineItems] = useState<LineItemForm[]>([]);
  const [cancelReason, setCancelReason] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [paymentRef, setPaymentRef] = useState("");

  const printRef = useRef<HTMLDivElement>(null);

  const handleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  }, [sortBy, sortOrder]);

  // Fetch invoices with all filters
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", search, statusFilter, startDate, endDate, subscriberFilter, areaFilter, planFilter, page, sortBy, sortOrder],
    queryFn: () => {
      const params = new URLSearchParams({ page: page.toString(), limit: "20", sortBy, sortOrder });
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (subscriberFilter) params.set("subscriberId", subscriberFilter);
      if (areaFilter) params.set("areaId", areaFilter);
      if (planFilter) params.set("planId", planFilter);
      return apiFetch(`/api/invoices?${params}`);
    },
  });

  // Fetch subscribers for filter and create dialog
  const { data: subscribersData } = useQuery({
    queryKey: ["subscribers-for-invoice"],
    queryFn: () => apiFetch("/api/subscribers?limit=200&status=ACTIVE").catch(() => ({ subscribers: [] })),
  });

  // Fetch areas
  const { data: areasData } = useQuery({
    queryKey: ["areas-filter"],
    queryFn: () => apiFetch<{ areas: AreaOption[] }>("/api/areas?limit=100").catch(() => ({ areas: [] })),
  });

  // Fetch plans
  const { data: plansData } = useQuery({
    queryKey: ["plans-filter"],
    queryFn: () => apiFetch<{ plans?: PlanOption[]; items?: PlanOption[] }>("/api/plans?limit=100&status=ACTIVE").catch(() => ({ plans: [] })),
  });

  // ─── Mutations ──────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (values: Record<string, string>) => {
      const body = { ...values };
      if (values.lineItems) body.lineItems = JSON.parse(values.lineItems);
      return apiFetch("/api/invoices", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Invoice ${res.invoice.invoiceNumber} created`);
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: () => toast.error("Failed to create invoice"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; [key: string]: unknown }) =>
      apiFetch(`/api/invoices/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (res, vars) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Invoice updated");
      setShowDetail(false);
      setShowEdit(false);
      setShowCancel(false);
      setShowPayment(false);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-detail", vars.id] });
    },
    onError: () => toast.error("Failed to update invoice"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/invoices/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Invoice deleted");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setShowDetail(false);
      setShowDeleteConfirm(false);
    },
    onError: () => toast.error("Failed to delete invoice"),
  });

  const creditNoteMutation = useMutation({
    mutationFn: ({ invoiceId, amount, reason, notes, autoApply }: { invoiceId: string; amount: number; reason: string; notes: string; autoApply: boolean }) =>
      apiFetch(`/api/invoices/${invoiceId}/credit-note`, {
        method: "POST",
        body: JSON.stringify({ amount, reason, notes, autoApply }),
      }),
    onSuccess: (res: { error?: string; creditNote?: CreditNoteItem; message?: string }) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Credit note created");
      setShowCreditNote(false);
      setCreditNoteAmount("");
      setCreditNoteReason("");
      setCreditNoteNotes("");
      setCreditNoteAutoApply(true);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      if (selectedInvoice) {
        queryClient.invalidateQueries({ queryKey: ["invoice-credit-notes", selectedInvoice.id] });
      }
    },
    onError: () => toast.error("Failed to create credit note"),
  });

  const duplicateMutation = useMutation({
    mutationFn: (inv: InvoiceItem | InvoiceDetail) => {
    const today = new Date();
    const dueDate = new Date(today.getTime() + 10 * 86400000);
    const periodEnd = new Date(today.getTime() + 30 * 86400000);
    const body: Record<string, unknown> = {
      subscriberId: inv.subscriber.id,
      planId: (inv as InvoiceDetail).plan?.id || inv.plan?.id || undefined,
      issueDate: today.toISOString().slice(0, 10),
      dueDate: dueDate.toISOString().slice(0, 10),
      periodStart: today.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      description: `Duplicate of ${inv.invoiceNumber}`,
    };
    const detail = inv as InvoiceDetail;
    if (detail.lineItems?.length) {
      body.lineItems = detail.lineItems.map((li) => ({ description: li.description, quantity: li.quantity, rate: li.rate, amount: li.amount }));
    }
    return apiFetch("/api/invoices", { method: "POST", body: JSON.stringify(body) });
  },
    onSuccess: (res: { error?: string; invoice?: { invoiceNumber: string } }) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Invoice ${res.invoice?.invoiceNumber} created as duplicate`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: () => toast.error("Failed to duplicate invoice"),
  });

  // ─── Handlers ───────────────────────────────────────
  const handleViewDetail = useCallback(async (invoiceId: string) => {
    try {
      const data = await apiFetch<{ invoice: InvoiceDetail; error?: string }>(`/api/invoices/${invoiceId}`);
      if (data.error) { toast.error(data.error); return; }
      setSelectedInvoice(data.invoice);
      setShowDetail(true);
    } catch {
      toast.error("Failed to load invoice details");
    }
  }, []);

  const openEdit = (inv: InvoiceItem | InvoiceDetail) => {
    const detail = inv as InvoiceDetail;
    setSelectedInvoice(inv);
    setEditForm({
      description: detail.description || "",
      discountType: detail.discountType || "",
      discountValue: detail.discountValue ? String(detail.discountValue) : "",
      discountAmount: String(inv.discountAmount || 0),
      lateFee: String(inv.lateFee || 0),
      notes: detail.notes || "",
      cgstRate: detail.cgstRate ? String(detail.cgstRate) : "",
      sgstRate: detail.sgstRate ? String(detail.sgstRate) : "",
      igstRate: detail.igstRate ? String(detail.igstRate) : "",
      reverseCharge: detail.reverseCharge || false,
    });
    setEditLineItems((inv as InvoiceDetail).lineItems?.map(li => ({ description: li.description, quantity: li.quantity, rate: li.rate, amount: li.amount })) || [defaultLineItem()]);
    setShowEdit(true);
  };

  const openCreditNote = (inv: InvoiceItem | InvoiceDetail) => {
    setSelectedInvoice(inv);
    setCreditNoteAmount(String(inv.paidAmount));
    setCreditNoteReason("");
    setCreditNoteNotes("");
    setCreditNoteAutoApply(true);
    setShowCreditNote(true);
  };

  const handleDuplicate = (inv: InvoiceItem | InvoiceDetail) => {
    duplicateMutation.mutate(inv);
  };

  const handleCreateCreditNote = () => {
    if (!selectedInvoice) return;
    const amount = parseFloat(creditNoteAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid credit note amount"); return; }
    if (!creditNoteReason.trim()) { toast.error("Enter a reason for the credit note"); return; }
    creditNoteMutation.mutate({
      invoiceId: selectedInvoice.id,
      amount,
      reason: creditNoteReason.trim(),
      notes: creditNoteNotes.trim(),
      autoApply: creditNoteAutoApply,
    });
  };

  const openCancel = (inv: InvoiceItem | InvoiceDetail) => {
    setSelectedInvoice(inv);
    setCancelReason("");
    setShowCancel(true);
  };

  const openPayment = (inv: InvoiceItem | InvoiceDetail) => {
    setSelectedInvoice(inv);
    setPaymentAmount(String(inv.balanceAmount > 0 ? inv.balanceAmount : inv.grandTotal));
    setPaymentMode("CASH");
    setPaymentRef("");
    setShowPayment(true);
  };

  const handleEditSave = () => {
    if (!selectedInvoice) return;
    updateMutation.mutate({
      id: selectedInvoice.id,
      description: editForm.description,
      discountType: editForm.discountType || null,
      discountValue: parseFloat(editForm.discountValue) || 0,
      discountAmount: parseFloat(editForm.discountAmount) || 0,
      lateFee: parseFloat(editForm.lateFee) || 0,
      notes: editForm.notes,
      lineItems: editLineItems,
      cgstRate: parseFloat(editForm.cgstRate) || 0,
      sgstRate: parseFloat(editForm.sgstRate) || 0,
      igstRate: parseFloat(editForm.igstRate) || 0,
      reverseCharge: editForm.reverseCharge,
    });
  };

  const handleCancel = () => {
    if (!selectedInvoice) return;
    updateMutation.mutate({
      id: selectedInvoice.id,
      status: "CANCELLED",
      notes: cancelReason ? `Cancellation: ${cancelReason}` : "Cancelled by admin",
    });
  };

  const handleRecordPayment = () => {
    if (!selectedInvoice) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    updateMutation.mutate({
      id: selectedInvoice.id,
      paymentAmount: amount,
      paymentMode,
      transactionRef: paymentRef,
    });
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (startDate) params.set("fromDate", startDate);
    if (endDate) params.set("toDate", endDate);
    if (search) params.set("search", search);
    if (subscriberFilter) params.set("subscriberId", subscriberFilter);
    if (areaFilter) params.set("areaId", areaFilter);
    if (planFilter) params.set("planId", planFilter);
    window.open(`/api/invoices/export-all?${params}`, "_blank");
    toast.success("Exporting CSV...");
  };

  const handlePrint = () => window.print();

  const handleDownloadReceipt = () => {
    const inv = selectedInvoice as InvoiceDetail;
    if (!inv) return;
    const lines = [
      "═══════════════════════════════════════",
      "         CRYPTSK ISP - RECEIPT         ",
      "═══════════════════════════════════════",
      "",
      `Invoice:    ${inv.invoiceNumber}`,
      `Date:       ${formatDateTime(inv.createdAt)}`,
      `Status:     ${STATUS_BADGE[inv.status]?.label || inv.status}`,
      "",
      "── Subscriber ──────────────────────",
      `Name:       ${inv.subscriber.name}`,
      `Code:       ${inv.subscriber.code}`,
      `Phone:      ${inv.subscriber.phone}`,
      `Address:    ${inv.subscriber.address || "N/A"}`,
      "",
      "── Invoice Details ─────────────────",
      `Plan:       ${inv.plan?.name || "N/A"}`,
      `Period:     ${formatDate(inv.periodStart)} to ${formatDate(inv.periodEnd)}`,
      `Due Date:   ${formatDate(inv.dueDate)}`,
      inv.isProRata ? `Pro-Rata:   ${inv.proRataDays} days` : "",
      "",
      "── Line Items ──────────────────────",
      ...((inv.lineItems?.length || 0) > 0 ? inv.lineItems.map((li, i) => [
        `  ${i + 1}. ${li.description || "Item"}`,
        `     Qty: ${li.quantity} x ${formatINR(li.rate)} = ${formatINR(li.amount)}`,
      ]).flat() : [`  Subtotal: ${formatINR(inv.subtotal)}`]),
      "",
      "── Amount Breakdown ────────────────",
      `CGST:       ${formatINR(inv.cgstAmount)}`,
      `SGST:       ${formatINR(inv.sgstAmount)}`,
      inv.igstAmount > 0 ? `IGST:       ${formatINR(inv.igstAmount)}` : "",
      inv.discountAmount > 0 ? `Discount:   -${formatINR(inv.discountAmount)}` : "",
      inv.lateFee > 0 ? `Late Fee:   +${formatINR(inv.lateFee)}` : "",
      "",
      `Grand Total:${formatINR(inv.grandTotal).padStart(12)}`,
      `Paid:       ${formatINR(inv.paidAmount).padStart(12)}`,
      `Balance:    ${formatINR(inv.balanceAmount).padStart(12)}`,
      "",
      "═══════════════════════════════════════",
      "     Thank you for your payment!      ",
      `     Generated: ${new Date().toLocaleString("en-IN")}`,
      "═══════════════════════════════════════",
    ].filter(Boolean).join("\n");

    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt_${inv.invoiceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Receipt downloaded");
  };

  const clearFilters = () => {
    setSearch(""); setStatusFilter("ALL"); setStartDate(""); setEndDate("");
    setSubscriberFilter(""); setAreaFilter(""); setPlanFilter(""); setPage(1);
  };

  const invoices = (data?.invoices || []) as InvoiceItem[];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const statusCounts = data?.statusCounts as Record<string, number> | undefined;

  const filteredSubs = (subscribersData?.subscribers || []).filter((s: SubOption) =>
    !subSearch || s.name.toLowerCase().includes(subSearch.toLowerCase()) || s.code.toLowerCase().includes(subSearch.toLowerCase())
  );

  const areas = areasData?.areas || [];
  const plans = plansData?.plans || [];

  // ─── Render ─────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in-0 duration-500" id="invoices-print-area">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl p-2.5 shadow-lg hidden sm:flex">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage and track all subscriber invoices</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowTaxSettings(true)}>
            <Receipt className="h-4 w-4 mr-2" />Tax Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInvoiceFormat(true)}>
            <Hash className="h-4 w-4 mr-2" />Invoice Format
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowRecurring(true)}>
            <RefreshCw className="h-4 w-4 mr-2" />Recurring
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowBulkGenerate(true)}>
            <Users className="h-4 w-4 mr-2" />Bulk Generate
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-red-600 hover:bg-red-700 text-white">
            <Plus className="h-4 w-4 mr-2" />Generate Invoice
          </Button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-slate-500/10 to-slate-600/5 ring-1 ring-border/50 rounded-xl shadow-sm hover:scale-[1.02] transition-all duration-200 border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-lg text-white">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-foreground tabular-nums">{total}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Total Invoices</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 ring-1 ring-border/50 rounded-xl shadow-sm hover:scale-[1.02] transition-all duration-200 border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{statusCounts?.PAID ?? 0}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Paid Invoices</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 ring-1 ring-border/50 rounded-xl shadow-sm hover:scale-[1.02] transition-all duration-200 border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg text-white">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{(statusCounts?.DRAFT ?? 0) + (statusCounts?.SENT ?? 0) + (statusCounts?.PARTIALLY_PAID ?? 0)}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Pending Invoices</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 ring-1 ring-border/50 rounded-xl shadow-sm hover:scale-[1.02] transition-all duration-200 border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg text-white">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">{statusCounts?.OVERDUE ?? 0}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Overdue Invoices</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Amount Highlight */}
      {(statusCounts?.OVERDUE ?? 0) > 0 && data?.totalOutstanding > 0 && (
        <Card className="rounded-xl border-2 border-red-200 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Overdue Amount Outstanding</p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70">{statusCounts?.OVERDUE} overdue invoice{(statusCounts?.OVERDUE ?? 0) > 1 ? "s" : ""} require attention</p>
            </div>
            <p className="text-xl font-bold text-red-600 tabular-nums">{formatINR(data.totalOutstanding)}</p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="rounded-xl border border-border/50 shadow-sm print:hidden">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoice #, name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={areaFilter || "ALL"} onValueChange={(v) => { setAreaFilter(v === "ALL" ? "" : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Areas</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={planFilter || "ALL"} onValueChange={(v) => { setPlanFilter(v === "ALL" ? "" : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Plans</SelectItem>
                {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <Select value={subscriberFilter || "ALL"} onValueChange={(v) => { setSubscriberFilter(v === "ALL" ? "" : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Subscriber" /></SelectTrigger>
              <SelectContent>
                <div className="max-h-60 overflow-y-auto p-1">
                  <Input placeholder="Search name/code..." className="mb-2" value={subSearch} onChange={(e) => setSubSearch(e.target.value)} />
                  <SelectItem value="ALL">All Subscribers</SelectItem>
                  {filteredSubs.map((s: SubOption) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                  ))}
                </div>
              </SelectContent>
            </Select>
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} placeholder="From date" />
            <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} placeholder="To date" />
            <Button variant="outline" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoice List */}
      <Card className="rounded-xl border border-border/50 shadow-sm print:hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center mb-5 shadow-sm">
                <Inbox className="h-10 w-10 text-muted-foreground/60" />
              </div>
              <p className="text-lg font-semibold text-foreground">No invoices found</p>
              <p className="text-sm text-muted-foreground mt-1.5 text-center max-w-sm">Try adjusting your filters or generate a new invoice to get started.</p>
              <div className="flex gap-2 mt-5">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />Clear Filters
                </Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-2" />Generate Invoice
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <SortableHead label="Invoice #" field="invoiceNumber" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="font-semibold text-xs uppercase tracking-wider">Subscriber</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Plan</TableHead>
                    <SortableHead label="Issue Date" field="issueDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="hidden sm:table-cell" />
                    <SortableHead label="Due Date" field="dueDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="hidden sm:table-cell" />
                    <SortableHead label="Amount" field="grandTotal" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
                    <SortableHead label="Paid" field="paidAmount" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" className="hidden sm:table-cell" />
                    <SortableHead label="Balance" field="balanceAmount" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" className="hidden sm:table-cell" />
                    <SortableHead label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const statusBorder = inv.status === "PAID" ? "border-l-[3px] border-l-emerald-500" : inv.status === "OVERDUE" ? "border-l-[3px] border-l-red-500" : inv.status === "SENT" || inv.status === "PARTIALLY_PAID" ? "border-l-[3px] border-l-amber-500" : inv.status === "DRAFT" ? "border-l-[3px] border-l-blue-500" : inv.status === "CANCELLED" ? "border-l-[3px] border-l-slate-400" : "border-l-[3px] border-l-transparent";
                    return (
                    <TableRow key={inv.id} className={`cursor-pointer hover:bg-muted/30 transition-colors duration-150 ${statusBorder}`} onClick={() => handleViewDetail(inv.id)}>
                      <TableCell className="font-mono text-xs font-semibold">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium">{inv.subscriber.name}</p>
                          <p className="text-[10px] text-muted-foreground">{inv.subscriber.code} · {inv.subscriber.area?.name || "N/A"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell">{inv.plan?.name || "N/A"}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">{formatDate(inv.issueDate)}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">
                        <div className="flex items-center gap-1">
                          {formatDate(inv.dueDate)}
                          {inv.isProRata && <span title={`Pro-rata: ${inv.proRataDays} days`}><CalendarClock className="h-3 w-3 text-amber-500" /></span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(inv.grandTotal)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-green-600 hidden sm:table-cell">{formatINR(inv.paidAmount)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-red-600 hidden sm:table-cell">{formatINR(inv.balanceAmount)}</TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewDetail(inv.id); }}>
                              <Eye className="h-4 w-4 mr-2" />View Details
                            </DropdownMenuItem>
                            {inv.status !== "CANCELLED" && inv.status !== "PAID" && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(inv); }}>
                                <Edit2 className="h-4 w-4 mr-2" />Edit Invoice
                              </DropdownMenuItem>
                            )}
                            {inv.status === "DRAFT" && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: inv.id, status: "SENT" }); }}>
                                <Send className="h-4 w-4 mr-2" />Mark as Sent
                              </DropdownMenuItem>
                            )}
                            {(inv.status === "DRAFT" || inv.status === "SENT" || inv.status === "PARTIALLY_PAID") && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: inv.id, status: "PAID" }); }}>
                                <CheckCircle2 className="h-4 w-4 mr-2" />Mark as Paid
                              </DropdownMenuItem>
                            )}
                            {inv.balanceAmount > 0 && inv.status !== "CANCELLED" && inv.status !== "PAID" && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openPayment(inv); }}>
                                <CreditCard className="h-4 w-4 mr-2" />Record Payment
                              </DropdownMenuItem>
                            )}
                            {(inv.status === "PAID" || inv.status === "OVERDUE" || inv.status === "PARTIALLY_PAID") && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openCreditNote(inv); }}>
                                <FileMinus className="h-4 w-4 mr-2 text-purple-600" />Credit Note
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(inv); }}>
                              <Copy className="h-4 w-4 mr-2" />Duplicate Invoice
                            </DropdownMenuItem>
                            {inv.status !== "CANCELLED" && inv.status !== "PAID" && (
                              <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); openCancel(inv); }}>
                                <Ban className="h-4 w-4 mr-2" />Cancel Invoice
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-xs px-2">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Dialogs ─── */}
      <CreateInvoiceDialog open={showCreate} onClose={() => setShowCreate(false)} onSubmit={createMutation.mutate} isSubmitting={createMutation.isPending} subscribers={subscribersData?.subscribers || []} />
      <BulkGenerateDialog open={showBulkGenerate} onClose={() => setShowBulkGenerate(false)} areas={areas} plans={plans} />
      <RecurringTemplatesDialog open={showRecurring} onClose={() => setShowRecurring(false)} subscribers={subscribersData?.subscribers || []} areas={areas} plans={plans} />
      <TaxSettingsDialog open={showTaxSettings} onClose={() => setShowTaxSettings(false)} />
      <InvoiceFormatDialog open={showInvoiceFormat} onClose={() => setShowInvoiceFormat(false)} />

      {/* ─── Credit Note Dialog ─── */}
      <Dialog open={showCreditNote} onOpenChange={setShowCreditNote}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileMinus className="h-5 w-5 text-purple-600" />Create Credit Note</DialogTitle>
            <DialogDescription>Issue a credit note for invoice {selectedInvoice?.invoiceNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Amount (max: {formatINR(selectedInvoice?.paidAmount || 0)})</Label>
              <Input type="number" value={creditNoteAmount} onChange={(e) => setCreditNoteAmount(e.target.value)} placeholder="0.00" min={0} max={selectedInvoice?.paidAmount || 0} />
            </div>
            <div>
              <Label className="text-xs">Reason *</Label>
              <Select value={creditNoteReason} onValueChange={setCreditNoteReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {CN_REASON_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={creditNoteNotes} onChange={(e) => setCreditNoteNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="creditNoteAutoApply" checked={creditNoteAutoApply} onCheckedChange={(v) => setCreditNoteAutoApply(!!v)} />
              <Label htmlFor="creditNoteAutoApply" className="text-xs">Auto-apply to subscriber balance</Label>
            </div>
            {creditNoteAutoApply && (
              <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-800">
                The credit amount will be added to the subscriber&apos;s balance immediately.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditNote(false)}>Cancel</Button>
            <Button onClick={handleCreateCreditNote} disabled={creditNoteMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
              {creditNoteMutation.isPending ? "Creating..." : "Create Credit Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Invoice Dialog ─── */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit2 className="h-5 w-5" />Edit Invoice {selectedInvoice?.invoiceNumber}</DialogTitle>
            <DialogDescription>Update invoice details (draft invoices only recommended)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>

            <div>
              <Label className="text-xs font-semibold">Line Items</Label>
              <div className="rounded-lg border mt-1.5 divide-y">
                {editLineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center p-2 bg-muted/20">
                    <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0 text-center">{idx + 1}</span>
                    <div className="flex-1">
                      <Input placeholder="Description" value={item.description} onChange={(e) => {
                        const u = [...editLineItems]; u[idx].description = e.target.value; setEditLineItems(u);
                      }} className="h-8 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 p-0" />
                    </div>
                    <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => {
                      const u = [...editLineItems]; u[idx].quantity = parseInt(e.target.value) || 0; u[idx].amount = u[idx].quantity * u[idx].rate; setEditLineItems(u);
                    }} className="w-14 h-8 text-xs text-center border-0 bg-transparent shadow-none focus-visible:ring-1 tabular-nums" min={1} />
                    <Input type="number" placeholder="Rate" value={item.rate} onChange={(e) => {
                      const u = [...editLineItems]; u[idx].rate = parseFloat(e.target.value) || 0; u[idx].amount = u[idx].quantity * u[idx].rate; setEditLineItems(u);
                    }} className="w-20 h-8 text-xs text-right border-0 bg-transparent shadow-none focus-visible:ring-1 tabular-nums" min={0} />
                    <div className="w-20 text-xs font-semibold text-right tabular-nums text-muted-foreground">{formatINR(item.amount)}</div>
                    {editLineItems.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0" onClick={() => setEditLineItems(editLineItems.filter((_, i) => i !== idx))}><Minus className="h-3 w-3" /></Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditLineItems([...editLineItems, defaultLineItem()])} className="w-full h-8 mt-1.5 text-xs border-dashed hover:border-solid"><Plus className="h-3 w-3 mr-1" />Add Line Item</Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Select value={editForm.discountType || "none"} onValueChange={(v) => setEditForm({ ...editForm, discountType: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Discount" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Discount</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentage %</SelectItem>
                  <SelectItem value="FLAT">Flat Amount</SelectItem>
                </SelectContent>
              </Select>
              {editForm.discountType && (
                <Input placeholder={editForm.discountType === "PERCENTAGE" ? "%" : "₹"} value={editForm.discountValue} onChange={(e) => setEditForm({ ...editForm, discountValue: e.target.value })} />
              )}
              <Input placeholder="Late Fee (₹)" value={editForm.lateFee} onChange={(e) => setEditForm({ ...editForm, lateFee: e.target.value })} />
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Tax Rate Overrides (0 = use plan default)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-[10px] text-green-700">CGST %</Label><Input type="number" step="0.01" min="0" max="100" value={editForm.cgstRate} onChange={(e) => setEditForm({ ...editForm, cgstRate: e.target.value })} className="h-8 text-xs" placeholder="0" /></div>
                <div className="space-y-1"><Label className="text-[10px] text-amber-700">SGST %</Label><Input type="number" step="0.01" min="0" max="100" value={editForm.sgstRate} onChange={(e) => setEditForm({ ...editForm, sgstRate: e.target.value })} className="h-8 text-xs" placeholder="0" /></div>
                <div className="space-y-1"><Label className="text-[10px] text-slate-700">IGST %</Label><Input type="number" step="0.01" min="0" max="100" value={editForm.igstRate} onChange={(e) => setEditForm({ ...editForm, igstRate: e.target.value })} className="h-8 text-xs" placeholder="0" /></div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="edit-reverse-charge" checked={editForm.reverseCharge} onCheckedChange={(v) => setEditForm({ ...editForm, reverseCharge: !!v })} />
              <Label htmlFor="edit-reverse-charge" className="text-xs">Reverse Charge (RCM)</Label>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel Dialog ─── */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Cancel Invoice</DialogTitle>
            <DialogDescription>Are you sure you want to cancel invoice {selectedInvoice?.invoiceNumber}?</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea placeholder="Reason for cancellation (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>Keep Invoice</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={updateMutation.isPending}>Cancel Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Record Payment Dialog ─── */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-green-600" />Record Payment</DialogTitle>
            <DialogDescription>
              Invoice {selectedInvoice?.invoiceNumber} · Balance: <span className="font-semibold text-red-600">{selectedInvoice ? formatINR(selectedInvoice.balanceAmount) : ""}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount (₹) *</Label>
              <Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Enter amount" min={0} />
            </div>
            <div>
              <Label className="text-xs">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="WALLET">Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Transaction Reference (optional)</Label>
              <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="UTR / Cheque # / Ref" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
              {updateMutation.isPending ? "Processing..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Invoice Detail Dialog ─── */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" ref={printRef}>
          {selectedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 print:hidden">
                  <FileText className="h-5 w-5 text-red-600" />
                  Invoice {selectedInvoice.invoiceNumber}
                  <StatusBadge status={selectedInvoice.status} className="ml-2" />
                </DialogTitle>
                <DialogTitle className="hidden print:block text-center text-lg font-bold">Invoice {selectedInvoice.invoiceNumber}</DialogTitle>
                <DialogDescription className="print:hidden">Invoice details and payment history</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Subscriber Info */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Subscriber Information</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{selectedInvoice.subscriber.name}</span></div>
                      <div><span className="text-muted-foreground">Code:</span> <span className="font-mono font-medium">{selectedInvoice.subscriber.code}</span></div>
                      <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{selectedInvoice.subscriber.phone}</span></div>
                      <div><span className="text-muted-foreground">Area:</span> <span className="font-medium">{selectedInvoice.subscriber.area?.name || "N/A"}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-medium">{(selectedInvoice.subscriber as InvoiceDetail["subscriber"]).address || "N/A"}</span></div>
                      {(selectedInvoice.subscriber as InvoiceDetail["subscriber"]).gstin && (
                        <div><span className="text-muted-foreground">GSTIN:</span> <span className="font-mono">{(selectedInvoice.subscriber as InvoiceDetail["subscriber"]).gstin}</span></div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Plan Info */}
                {(selectedInvoice as InvoiceDetail).plan && (
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Plan Details</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Plan:</span> <span className="font-medium">{(selectedInvoice as InvoiceDetail).plan?.name}</span></div>
                        <div><span className="text-muted-foreground">Speed:</span> <span className="font-medium">{(selectedInvoice as InvoiceDetail).plan?.downloadSpeed}Mbps / {(selectedInvoice as InvoiceDetail).plan?.uploadSpeed}Mbps</span></div>
                        <div><span className="text-muted-foreground">Validity:</span> <span className="font-medium">{(selectedInvoice as InvoiceDetail).plan?.validityDays} days</span></div>
                        <div><span className="text-muted-foreground">Monthly Fee:</span> <span className="font-semibold">{formatINR((selectedInvoice as InvoiceDetail).plan?.priceMonthly ?? 0)}</span></div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Billing Period */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Billing Period</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Issue:</span> <span className="font-medium">{formatDate(selectedInvoice.issueDate)}</span></div>
                      <div><span className="text-muted-foreground">Due:</span> <span className="font-medium">{formatDate(selectedInvoice.dueDate)}</span></div>
                      <div><span className="text-muted-foreground">Period:</span> <span className="font-medium">{formatDate(selectedInvoice.periodStart)} - {formatDate(selectedInvoice.periodEnd)}</span></div>
                      {selectedInvoice.isProRata && (
                        <div><span className="text-muted-foreground">Pro-Rata:</span> <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{selectedInvoice.proRataDays} days</Badge></div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Line Items */}
                {(selectedInvoice as InvoiceDetail).lineItems?.length > 0 && (
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Line Items</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-[10px]">Description</TableHead>
                          <TableHead className="text-[10px] text-right">Qty</TableHead>
                          <TableHead className="text-[10px] text-right">Rate</TableHead>
                          <TableHead className="text-[10px] text-right">Amount</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {(selectedInvoice as InvoiceDetail).lineItems.map((li) => (
                            <TableRow key={li.id}>
                              <TableCell className="text-xs">{li.description || "-"}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{li.quantity}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{formatINR(li.rate)}</TableCell>
                              <TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(li.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* Tax Breakdown */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Amount Breakdown</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatINR(selectedInvoice.subtotal)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">CGST ({((selectedInvoice.cgstAmount / (selectedInvoice.subtotal || 1)) * 100 || 0).toFixed(0)}%)</span><span className="tabular-nums">{formatINR(selectedInvoice.cgstAmount)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">SGST ({((selectedInvoice.sgstAmount / (selectedInvoice.subtotal || 1)) * 100 || 0).toFixed(0)}%)</span><span className="tabular-nums">{formatINR(selectedInvoice.sgstAmount)}</span></div>
                      {selectedInvoice.igstAmount > 0 && (
                        <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span className="tabular-nums">{formatINR(selectedInvoice.igstAmount)}</span></div>
                      )}
                      <div className="flex justify-between"><span className="text-muted-foreground">Total Tax</span><span className="tabular-nums">{formatINR(selectedInvoice.totalTax)}</span></div>
                      {selectedInvoice.discountAmount > 0 && (
                        <div className="flex justify-between text-green-600"><span>Discount</span><span className="tabular-nums">-{formatINR(selectedInvoice.discountAmount)}</span></div>
                      )}
                      {selectedInvoice.lateFee > 0 && (
                        <div className="flex justify-between text-red-600"><span>Late Fee</span><span className="tabular-nums">+{formatINR(selectedInvoice.lateFee)}</span></div>
                      )}
                      {(selectedInvoice as InvoiceDetail).advanceAdjustment > 0 && (
                        <div className="flex justify-between text-slate-600"><span>Advance Adjustment</span><span className="tabular-nums">-{formatINR((selectedInvoice as InvoiceDetail).advanceAdjustment)}</span></div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-sm"><span>Grand Total</span><span className="tabular-nums text-red-600">{formatINR(selectedInvoice.grandTotal)}</span></div>
                      <div className="flex justify-between text-green-600"><span>Paid</span><span className="tabular-nums">{formatINR(selectedInvoice.paidAmount)}</span></div>
                      <div className="flex justify-between font-bold text-sm text-red-600"><span>Balance Due</span><span className="tabular-nums">{formatINR(selectedInvoice.balanceAmount)}</span></div>
                    </div>
                  </CardContent>
                </Card>

                {/* Credit Notes */}
                {(selectedInvoice.status === "PAID" || selectedInvoice.status === "OVERDUE" || selectedInvoice.status === "PARTIALLY_PAID") && (
                  <Card className="border shadow-sm border-purple-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><FileMinus className="h-4 w-4 text-purple-600" />Credit Notes</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                      <CreditNotesList invoiceId={selectedInvoice.id} />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 border-purple-200 text-purple-600 hover:bg-purple-50"
                        onClick={() => openCreditNote(selectedInvoice)}
                      >
                        <FileMinus className="h-4 w-4 mr-1" />Create Credit Note
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Payments */}
                {(selectedInvoice as InvoiceDetail).payments?.length > 0 && (
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment History</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-[10px]">Date</TableHead>
                          <TableHead className="text-[10px]">Mode</TableHead>
                          <TableHead className="text-[10px] text-right">Amount</TableHead>
                          <TableHead className="text-[10px]">Status</TableHead>
                          <TableHead className="text-[10px]">Collected By</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {(selectedInvoice as InvoiceDetail).payments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs">{formatDateTime(p.createdAt)}</TableCell>
                              <TableCell className="text-xs">{PAYMENT_MODE_LABELS[p.paymentMode] || p.paymentMode}</TableCell>
                              <TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(p.amount)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] px-1 py-0 ${p.status === "VERIFIED" ? "bg-green-100 text-green-700 border-green-200" : "bg-yellow-100 text-yellow-700 border-yellow-200"}`}>{p.status}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">{p.collectedBy?.name || "N/A"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* Notes */}
                {(selectedInvoice as InvoiceDetail).notes && (
                  <Card className="border shadow-sm">
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">Notes:</p>
                      <p className="text-xs mt-1">{(selectedInvoice as InvoiceDetail).notes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <DialogFooter className="flex-row gap-2 sm:justify-between print:hidden">
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} disabled={selectedInvoice.status === "PAID" || selectedInvoice.status === "PARTIALLY_PAID"}>
                    <Trash2 className="h-4 w-4 mr-1" />Delete
                  </Button>
                  {selectedInvoice.status !== "CANCELLED" && selectedInvoice.status !== "PAID" && (
                    <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => openCancel(selectedInvoice)}>
                      <Ban className="h-4 w-4 mr-1" />Cancel
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />Print</Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadReceipt}><Download className="h-4 w-4 mr-1" />Receipt</Button>
                  {selectedInvoice.status !== "CANCELLED" && selectedInvoice.status !== "PAID" && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(selectedInvoice)}><Edit2 className="h-4 w-4 mr-1" />Edit</Button>
                  )}
                  {selectedInvoice.balanceAmount > 0 && selectedInvoice.status !== "CANCELLED" && (
                    <Button size="sm" onClick={() => openPayment(selectedInvoice)} className="bg-green-600 hover:bg-green-700 text-white">
                      <CreditCard className="h-4 w-4 mr-1" />Record Payment
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ─── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice {selectedInvoice?.invoiceNumber}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => selectedInvoice && deleteMutation.mutate(selectedInvoice.id)} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
