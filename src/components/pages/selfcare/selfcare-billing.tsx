"use client";

import React, { useEffect, useState, useCallback } from "react";
import { type InvoiceItem, type PaymentItem } from "@/store/subscriber-auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Receipt,
  CreditCard,
  Download,
  Eye,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  CalendarCheck,
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";

// ─── Gradient Icon Circle ───────────────────────────────────

function GradientIcon({ icon: Icon, from, to }: { icon: React.ElementType; from?: string; to?: string }) {
  return (
    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${from || "from-red-500"} ${to || "to-red-700"} flex items-center justify-center flex-shrink-0`}>
      <Icon className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

// ─── Status Dot Badge ───────────────────────────────────────

function StatusDotBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Badge className={`text-[10px] inline-flex items-center gap-1 ${className || ""}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {children}
    </Badge>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function invoiceStatusBadge(status: string) {
  const map: Record<string, string> = {
    PAID: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
    UNPAID: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0",
    OVERDUE: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
    PARTIAL: "bg-violet-100 text-violet-700 hover:bg-violet-100 border-0",
    CANCELLED: "bg-slate-100 text-slate-600 hover:bg-slate-100 border-0",
  };
  return map[status] || "bg-muted text-muted-foreground border-0";
}

function paymentModeBadge(mode: string) {
  const map: Record<string, string> = {
    UPI: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
    CASH: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0",
    CHEQUE: "bg-slate-100 text-slate-600 hover:bg-slate-100 border-0",
    ONLINE: "bg-violet-100 text-violet-700 hover:bg-violet-100 border-0",
    BANK_TRANSFER: "bg-red-100 text-red-800 hover:bg-red-100 border-0",
  };
  return map[mode] || "bg-muted text-muted-foreground border-0";
}

function paymentStatusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
    PENDING: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0",
    FAILED: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
    REFUNDED: "bg-slate-100 text-slate-600 hover:bg-slate-100 border-0",
  };
  return map[status] || "bg-muted text-muted-foreground border-0";
}

// ─── Data Hooks ───────────────────────────────────────────────

function useInvoiceData() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriber-auth/invoices?page=${page}&limit=${limit}`);
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices || []);
        setTotal(data.pagination?.total || 0);
      } else {
        setError(data.error || "Failed to fetch invoices");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

  return { invoices, loading, error, refetch: fetchData, page, setPage, totalPages };
}

function usePaymentData() {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriber-auth/payments?page=${page}&limit=${limit}`);
      const data = await res.json();
      if (data.success) {
        setPayments(data.payments || []);
        setTotal(data.pagination?.total || 0);
      } else {
        setError(data.error || "Failed to fetch payments");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

  return { payments, loading, error, refetch: fetchData, page, setPage, totalPages };
}

// ─── Skeleton ─────────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  iconBg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconBg: string;
}) {
  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Invoice Table ────────────────────────────────────────────

function InvoiceTable({ invoices }: { invoices: InvoiceItem[] }) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Receipt className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No invoices found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Invoice #</th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground hidden sm:table-cell">Date</th>
            <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Amount</th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground hidden md:table-cell">Due Date</th>
            <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Status</th>
            <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <td className="py-3 px-4 font-medium text-foreground">
                {inv.invoiceNumber}
              </td>
              <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">
                {formatDate(inv.issueDate || inv.createdAt)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-foreground">
                {formatCurrency(inv.grandTotal)}
              </td>
              <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                {formatDate(inv.dueDate)}
              </td>
              <td className="py-3 px-4 text-center">
                <StatusDotBadge className={invoiceStatusBadge(inv.status)}>
                  {inv.status}
                </StatusDotBadge>
              </td>
              <td className="py-3 px-4 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    toast.info("Invoice", {
                      description: `Viewing invoice ${inv.invoiceNumber}`,
                    })
                  }
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    toast.info("Download", {
                      description: `Downloading invoice ${inv.invoiceNumber}`,
                    })
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Payment Table ────────────────────────────────────────────

function PaymentTable({ payments }: { payments: PaymentItem[] }) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CreditCard className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No payments found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Payment ID</th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground hidden sm:table-cell">Date</th>
            <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Amount</th>
            <th className="text-center py-3 px-4 font-semibold text-muted-foreground hidden md:table-cell">Mode</th>
            <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Status</th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground hidden lg:table-cell">Reference #</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((pay) => (
            <tr
              key={pay.id}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <td className="py-3 px-4 font-medium text-foreground">
                {pay.id.slice(0, 8).toUpperCase()}
              </td>
              <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">
                {formatDate(pay.createdAt)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-foreground">
                {formatCurrency(pay.amount)}
              </td>
              <td className="py-3 px-4 text-center hidden md:table-cell">
                <StatusDotBadge className={paymentModeBadge(pay.paymentMode)}>
                  {pay.paymentMode}
                </StatusDotBadge>
              </td>
              <td className="py-3 px-4 text-center">
                <StatusDotBadge className={paymentStatusBadge(pay.status)}>
                  {pay.status}
                </StatusDotBadge>
              </td>
              <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell font-mono text-xs">
                {pay.transactionRef || pay.receiptNumber || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────

export default function SelfcareBilling() {
  const {
    invoices,
    loading: invLoading,
    error: invError,
    refetch: refetchInv,
    page: invPage,
    setPage: setInvPage,
    totalPages: invTotalPages,
  } = useInvoiceData();

  const {
    payments,
    loading: payLoading,
    error: payError,
    refetch: refetchPay,
    page: payPage,
    setPage: setPayPage,
    totalPages: payTotalPages,
  } = usePaymentData();

  // Compute summary
  const totalBilled = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalPaid = invoices
    .filter((i) => i.status === "PAID" || i.status === "PARTIAL")
    .reduce((s, i) => s + (i.paidAmount || 0), 0);
  const outstanding = totalBilled - totalPaid;

  const totalPaidMonth = payments.reduce((s, p) => s + p.amount, 0);
  const now = new Date();
  const thisMonth = payments
    .filter((p) => {
      const d = new Date(p.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, p) => s + p.amount, 0);
  const thisYear = payments
    .filter((p) => new Date(p.createdAt).getFullYear() === now.getFullYear())
    .reduce((s, p) => s + p.amount, 0); // keep as-is: payment.amount is correct

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GradientIcon icon={Receipt} from="from-red-500" to="to-red-700" />
            Billing & Payments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View your invoices and payment history
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchInv(); refetchPay(); }} className="gap-1.5 border-border/50 bg-background hover:bg-muted/50">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-1.5">
            <Receipt className="w-3.5 h-3.5" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <CreditCard className="w-3.5 h-3.5" />
            Payments
          </TabsTrigger>
        </TabsList>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              icon={IndianRupee}
              label="Total Billed"
              value={formatCurrency(totalBilled)}
              iconBg="bg-gradient-to-br from-slate-500 to-slate-600"
            />
            <SummaryCard
              icon={CalendarCheck}
              label="Total Paid"
              value={formatCurrency(totalPaid)}
              iconBg="bg-gradient-to-br from-red-500 to-red-700"
            />
            <SummaryCard
              icon={AlertTriangle}
              label="Outstanding"
              value={formatCurrency(outstanding)}
              iconBg={outstanding > 0 ? "bg-gradient-to-br from-red-500 to-rose-600" : "bg-gradient-to-br from-red-500 to-red-700"}
            />
          </div>

          <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <GradientIcon icon={Receipt} from="from-slate-400" to="to-slate-500" />
                Invoice History
              </CardTitle>
              <CardDescription>All invoices for your account</CardDescription>
            </CardHeader>
            <CardContent>
              {invLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : invError ? (
                <div className="text-center py-8 text-sm text-destructive">{invError}</div>
              ) : (
                <>
                  <InvoiceTable invoices={invoices} />
                  <Pagination
                    page={invPage}
                    totalPages={invTotalPages}
                    onPageChange={setInvPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              icon={CreditCard}
              label="Total Paid (All Time)"
              value={formatCurrency(totalPaidMonth)}
              iconBg="bg-gradient-to-br from-red-500 to-red-700"
            />
            <SummaryCard
              icon={TrendingUp}
              label="Paid This Month"
              value={formatCurrency(thisMonth)}
              iconBg="bg-gradient-to-br from-amber-500 to-orange-600"
            />
            <SummaryCard
              icon={CalendarCheck}
              label="Paid This Year"
              value={formatCurrency(thisYear)}
              iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
            />
          </div>

          <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <GradientIcon icon={CreditCard} from="from-slate-400" to="to-slate-500" />
                Payment History
              </CardTitle>
              <CardDescription>All payments made for your account</CardDescription>
            </CardHeader>
            <CardContent>
              {payLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : payError ? (
                <div className="text-center py-8 text-sm text-destructive">{payError}</div>
              ) : (
                <>
                  <PaymentTable payments={payments} />
                  <Pagination
                    page={payPage}
                    totalPages={payTotalPages}
                    onPageChange={setPayPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
