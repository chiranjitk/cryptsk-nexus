"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, FileText, IndianRupee, CheckCircle, Clock,
  AlertCircle, TrendingUp, Wallet, Gift, MoreHorizontal, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type Invoice = {
  id: string; invoiceNumber: string; issueDate: string; dueDate: string;
  subtotal: number; taxAmount: number; total: number; paidAmount: number;
  balanceDue: number; status: string; paymentStatus: string;
  customer: { displayName: string; customerCode: string; email: string | null };
  _count: { lines: number; payments: number };
};

export function BillingPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [showPayment, setShowPayment] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"invoices" | "payments">("invoices");

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ["invoices", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: payData, isLoading: payLoading } = useQuery({
    queryKey: ["payments", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/payments?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const invoices: Invoice[] = invData?.invoices || [];
  const payments: any[] = payData?.payments || [];

  // Stats
  const totalIssued = invoices.reduce((sum, i) => sum + i.total, 0);
  const totalPaid = invoices.reduce((sum, i) => sum + i.paidAmount, 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + i.balanceDue, 0);
  const overdueCount = invoices.filter(i => i.status === "overdue" || (i.status === "issued" && new Date(i.dueDate) < new Date())).length;

  function fmtCurrency(amount: number) {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function getStatusBadge(status: string, dueDate?: string) {
    if (status === "paid") return <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/5 text-emerald-600"><CheckCircle className="size-3 mr-1" />Paid</Badge>;
    if (status === "partial") return <Badge variant="outline" className="text-[10px] border-amber-500/30 bg-amber-500/5 text-amber-600"><Clock className="size-3 mr-1" />Partial</Badge>;
    if (status === "overdue" || (status === "issued" && dueDate && new Date(dueDate) < new Date())) return <Badge variant="outline" className="text-[10px] border-rose-500/30 bg-rose-500/5 text-rose-600"><AlertCircle className="size-3 mr-1" />Overdue</Badge>;
    if (status === "issued") return <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/5 text-blue-600"><Clock className="size-3 mr-1" />Issued</Badge>;
    if (status === "draft") return <Badge variant="outline" className="text-[10px] text-muted-foreground">Draft</Badge>;
    if (status === "cancelled" || status === "void") return <Badge variant="outline" className="text-[10px] border-muted text-muted-foreground">{status}</Badge>;
    return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Finance</h1>
          <p className="text-sm text-muted-foreground">
            {invoices.length} invoices · {payments.length} payments · GST 18%
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setTab(tab === "invoices" ? "payments" : "invoices")}>
            {tab === "invoices" ? <><Wallet className="size-4" /> Payments</> : <><FileText className="size-4" /> Invoices</>}
          </Button>
          <Button className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> Create Invoice
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-lift cryptsk-card-load">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Issued</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10"><IndianRupee className="size-4 text-blue-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{fmtCurrency(totalIssued)}</div>
            <p className="text-xs text-muted-foreground mt-1">{invoices.length} invoices</p>
          </CardContent>
        </Card>
        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "50ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Collected</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10"><TrendingUp className="size-4 text-emerald-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-emerald-600">{fmtCurrency(totalPaid)}</div>
            <p className="text-xs text-muted-foreground mt-1">{payments.length} payments</p>
          </CardContent>
        </Card>
        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "100ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Outstanding</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10"><Clock className="size-4 text-amber-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-amber-600">{fmtCurrency(totalOutstanding)}</div>
            <p className="text-xs text-muted-foreground mt-1">awaiting payment</p>
          </CardContent>
        </Card>
        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "150ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Overdue</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-rose-500/10"><AlertCircle className="size-4 text-rose-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-rose-600">{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-1">past due date</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{tab === "invoices" ? "All Invoices" : "All Payments"}</CardTitle>
            <div className="flex gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">All status</option>
                <option value="issued">Issued</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder={`Search ${tab}…`} value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-48 pl-8 text-sm" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tab === "invoices" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8"><div className="size-6 mx-auto rounded-full border-2 border-primary border-t-transparent cryptsk-spin" /></TableCell></TableRow>
                  ) : invoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-muted/50">
                      <TableCell className="text-sm font-mono font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6"><AvatarFallback className="bg-primary/10 text-primary text-[9px] font-bold">{inv.customer.displayName.charAt(0)}</AvatarFallback></Avatar>
                          <div>
                            <p className="text-sm font-medium">{inv.customer.displayName}</p>
                            <p className="text-[10px] text-muted-foreground">{inv.customer.customerCode}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.issueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums">{fmtCurrency(inv.total)}</TableCell>
                      <TableCell className="text-sm tabular-nums text-emerald-600">{fmtCurrency(inv.paidAmount)}</TableCell>
                      <TableCell className="text-sm tabular-nums text-amber-600">{fmtCurrency(inv.balanceDue)}</TableCell>
                      <TableCell>{getStatusBadge(inv.status, inv.dueDate)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><Eye className="mr-2 size-4" /> View</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowPayment(inv.id)}><Wallet className="mr-2 size-4" /> Record Payment</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem><Gift className="mr-2 size-4" /> Send Reminder</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {invoices.length === 0 && !invLoading && (
                    <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No invoices found. Click "Create Invoice" to make one.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="size-6 mx-auto rounded-full border-2 border-primary border-t-transparent cryptsk-spin" /></TableCell></TableRow>
                  ) : payments.map((pay) => (
                    <TableRow key={pay.id} className="hover:bg-muted/50">
                      <TableCell className="text-sm font-mono">{pay.paymentNumber}</TableCell>
                      <TableCell className="text-sm">{pay.customer?.displayName || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{pay.invoice?.invoiceNumber || "—"}</TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums text-emerald-600">{fmtCurrency(pay.amount)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{pay.method}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(pay.receivedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${pay.status === "completed" ? "border-emerald-500/30 text-emerald-600" : "border-amber-500/30 text-amber-600"}`}>{pay.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && !payLoading && (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No payments recorded yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && <CreateInvoiceDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["invoices"] }); }} />}
      {showPayment && <PaymentDialog invoiceId={showPayment} onClose={() => setShowPayment(null)} onSaved={() => { setShowPayment(null); qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["payments"] }); }} />}
    </div>
  );
}

function CreateInvoiceDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = React.useState("");
  const [dueDate, setDueDate] = React.useState(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
  const [description, setDescription] = React.useState("Monthly Broadband Plan");
  const [quantity, setQuantity] = React.useState("1");
  const [unitPrice, setUnitPrice] = React.useState("500");
  const [taxRate, setTaxRate] = React.useState("18");
  const [discountPercent, setDiscountPercent] = React.useState("0");

  // Fetch customers
  const { data: custData } = useQuery({
    queryKey: ["customers-for-invoice"],
    queryFn: async () => { const res = await fetch("/api/customers"); if (!res.ok) return { customers: [] }; return res.json(); },
  });
  const customers: any[] = custData?.customers || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const lines = [{ description, quantity: Number(quantity), unitPrice: Number(unitPrice) }];
      const res = await fetch("/api/invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, dueDate, lines, taxRate: Number(taxRate), discountPercent: Number(discountPercent) }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const data = await res.json();
      toast({ title: "Invoice created", description: `${data.invoice.invoiceNumber} — ₹${data.invoice.total.toFixed(2)}` });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  const subtotal = Number(quantity) * Number(unitPrice);
  const discount = subtotal * (Number(discountPercent) / 100);
  const taxable = subtotal - discount;
  const tax = taxable * (Number(taxRate) / 100);
  const total = taxable + tax;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle><DialogDescription>Bill a customer for services</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Customer</Label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName} ({c.customerCode})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Due Date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Tax Rate (GST %)</Label><Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="h-9" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} required className="h-9" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Qty</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Unit Price (₹)</Label><Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Discount %</Label><Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className="h-9" /></div>
          </div>
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-₹{discount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span className="tabular-nums">₹{tax.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span className="tabular-nums">₹{total.toFixed(2)}</span></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create Invoice</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ invoiceId, onClose, onSaved }: { invoiceId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("cash");
  const [transactionId, setTransactionId] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Get invoice to know balance + customer
  const { data: invData } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });
  const invoice = invData?.invoice;
  const customerId = invoice?.customerId || "";
  const balance = invoice?.balanceDue || 0;

  React.useEffect(() => { if (balance > 0 && !amount) setAmount(String(balance)); }, [balance]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, customerId, amount: Number(amount), method, transactionId, notes }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      toast({ title: "Payment recorded", description: `₹${Number(amount).toFixed(2)} via ${method}` });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle><DialogDescription>{invoice?.invoiceNumber} — Balance: ₹{balance.toFixed(2)}</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs">Amount (₹)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className="h-9" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Method</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option><option value="wallet">Wallet</option>
              <option value="cheque">Cheque</option><option value="razorpay">Razorpay</option><option value="stripe">Stripe</option>
            </select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Transaction ID (optional)</Label><Input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className="h-9 font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Record Payment</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
